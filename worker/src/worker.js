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
  const { mediaId, path: originalPath } = job.data;
  const thumbPath = path.join(derivedRoot, `${mediaId}.jpg`);

  await fs.mkdir(derivedRoot, { recursive: true });
  await sharp(originalPath).resize(640, 640, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(thumbPath);

  const ai = await axios.post(`${process.env.AI_SERVICE_URL}/embed`, { media_id: mediaId, path: originalPath });

  const modelRow = await pool.query(
    `SELECT id
     FROM ml_models
     WHERE model_key = 'clip-vit-b32'
       AND is_active = TRUE
     LIMIT 1`
  );

  let modelId;
  if (modelRow.rowCount === 0) {
    const inserted = await pool.query(
      `INSERT INTO ml_models (model_key, modality, embedding_dim, distance_metric)
       VALUES ('clip-vit-b32', 'semantic', 512, 'cosine')
       RETURNING id`
    );
    modelId = inserted.rows[0].id;
  } else {
    modelId = modelRow.rows[0].id;
  }

  await pool.query(
    `INSERT INTO media_semantic_embeddings (media_id, model_id, embedding)
     VALUES ($1, $2, $3)
     ON CONFLICT (media_id, model_id)
     DO UPDATE SET embedding = EXCLUDED.embedding,
                   created_at = NOW()`,
    [mediaId, modelId, ai.data.clip_embedding]
  );
}, { connection: { url: process.env.REDIS_URL } });

console.log('worker running');
