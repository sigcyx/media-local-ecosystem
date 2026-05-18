import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import axios from 'axios';
import { Queue, Worker } from 'bullmq';
import { Pool } from 'pg';
import client from 'prom-client';

dotenv.config();

const derivedRoot = process.env.DERIVED_MEDIA_PATH || '/media/derived';
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});
const metricsPort = Number(process.env.WORKER_METRICS_PORT || 9091);
const queueClient = new Queue('media-processing', { connection: { url: process.env.REDIS_URL } });

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'media_worker_' });
const jobsProcessedTotal = new client.Counter({
  name: 'jobs_processed_total',
  help: 'Total processed jobs by status',
  labelNames: ['job', 'status']
});
const jobDurationMs = new client.Histogram({
  name: 'job_duration_ms',
  help: 'Job execution duration in ms',
  labelNames: ['job'],
  buckets: [25, 50, 100, 250, 500, 1000, 2500, 5000, 15000]
});
const jobRetriesTotal = new client.Counter({
  name: 'job_retries_total',
  help: 'Total job retries',
  labelNames: ['job']
});
const queueDepth = new client.Gauge({
  name: 'queue_depth',
  help: 'Current queue depth',
  labelNames: ['queue']
});
register.registerMetric(jobsProcessedTotal);
register.registerMetric(jobDurationMs);
register.registerMetric(jobRetriesTotal);
register.registerMetric(queueDepth);

function log(level, message, extra = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'worker',
    message,
    ...extra
  }));
}

new Worker('media-processing', async (job) => {
  const { mediaId, activityId, path: originalPath } = job.data;
  const thumbPath = path.join(derivedRoot, `${mediaId}.jpg`);
  const end = jobDurationMs.startTimer({ job: job.name });
  if ((job.attemptsMade || 0) > 0) {
    jobRetriesTotal.inc({ job: job.name });
  }

  try {
    if (activityId) {
      await pool.query(
        `UPDATE upload_activity
         SET status = 'processing', updated_at = NOW(), last_error = NULL
         WHERE id = $1`,
        [activityId]
      );
    }

    await fs.mkdir(derivedRoot, { recursive: true });
    await sharp(originalPath).resize(640, 640, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(thumbPath);

    const ai = await axios.post(`${process.env.AI_SERVICE_URL}/embed`, { media_id: mediaId, path: originalPath });

    await pool.query(
      `INSERT INTO semantic_embeddings (asset_id, embedding)
       VALUES ($1, $2)
       ON CONFLICT (asset_id)
       DO UPDATE SET embedding = EXCLUDED.embedding,
                     created_at = NOW()`,
      [mediaId, ai.data.clip_embedding]
    );

    if (activityId) {
      await pool.query(
        `UPDATE upload_activity
         SET status = 'ready', updated_at = NOW(), last_error = NULL
         WHERE id = $1`,
        [activityId]
      );
    }
    jobsProcessedTotal.inc({ job: job.name, status: 'success' });
    end();
    log('info', 'job completed', { job_id: job.id, asset_id: mediaId });
  } catch (error) {
    if (activityId) {
      await pool.query(
        `UPDATE upload_activity
         SET status = 'failed', updated_at = NOW(), last_error = $2
         WHERE id = $1`,
        [activityId, String(error?.message || error)]
      );
    }
    jobsProcessedTotal.inc({ job: job.name, status: 'failed' });
    end();
    log('error', 'job failed', { job_id: job.id, asset_id: mediaId, error_message: String(error?.message || error) });
    throw error;
  }
}, { connection: { url: process.env.REDIS_URL } });

http.createServer(async (req, res) => {
  if (req.url !== '/metrics') {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
}).listen(metricsPort, () => {
  log('info', 'worker metrics server listening', { port: metricsPort });
});

log('info', 'worker running');

setInterval(async () => {
  try {
    const [waiting, delayed, active] = await Promise.all([
      queueClient.getWaitingCount(),
      queueClient.getDelayedCount(),
      queueClient.getActiveCount()
    ]);
    queueDepth.set({ queue: 'media-processing' }, waiting + delayed + active);
  } catch (error) {
    log('error', 'queue depth collection failed', { error_message: String(error?.message || error) });
  }
}, 5000);
