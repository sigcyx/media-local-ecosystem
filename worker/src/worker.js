import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import axios from 'axios';
import { Worker } from 'bullmq';
import { Pool } from 'pg';

dotenv.config();

const derivedRoot = process.env.DERIVED_MEDIA_PATH || '/media/derived';
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});

new Worker('media-processing', async (job) => {
  const { mediaId, activityId, path: originalPath } = job.data;
  const thumbPath = path.join(derivedRoot, `${mediaId}.jpg`);

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
  } catch (error) {
    if (activityId) {
      await pool.query(
        `UPDATE upload_activity
         SET status = 'failed', updated_at = NOW(), last_error = $2
         WHERE id = $1`,
        [activityId, String(error?.message || error)]
      );
    }
    throw error;
  }
}, { connection: { url: process.env.REDIS_URL } });

console.log('worker running');
