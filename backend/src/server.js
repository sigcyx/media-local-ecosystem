import express from 'express';
import multer from 'multer';
import exifr from 'exifr';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { Queue } from 'bullmq';

dotenv.config();

const app = express();
const upload = multer({ dest: '/tmp/uploads' });
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});

const queue = new Queue('media-processing', { connection: { url: process.env.REDIS_URL } });
const sourceRoot = process.env.SOURCE_MEDIA_PATH || '/media/source';

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const tempPath = req.file.path;
  const buffer = await fs.readFile(tempPath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const ext = path.extname(req.file.originalname || '');
  const filename = `${sha256}${ext}`;
  const finalPath = path.join(sourceRoot, filename);

  const [{ count }] = (await pool.query('SELECT COUNT(*)::int AS count FROM media_assets WHERE sha256_hash = $1', [sha256])).rows;
  if (count > 0) {
    await fs.unlink(tempPath);
    return res.status(200).json({ duplicate: true, sha256 });
  }

  await fs.copyFile(tempPath, finalPath);
  await fs.unlink(tempPath);

  const exif = await exifr.parse(finalPath, { gps: true }).catch(() => ({}));

  const insertAsset = await pool.query(
    `INSERT INTO media_assets (sha256_hash, file_path, file_size_bytes, mime_type, captured_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [sha256, finalPath, req.file.size, req.file.mimetype, exif?.DateTimeOriginal || null]
  );

  const mediaId = insertAsset.rows[0].id;
  await pool.query(
    `INSERT INTO media_exif (media_id, camera_model, latitude, longitude, shutter_speed, iso)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      mediaId,
      exif?.Model || null,
      exif?.latitude || null,
      exif?.longitude || null,
      exif?.ExposureTime ? String(exif.ExposureTime) : null,
      exif?.ISO || null
    ]
  );

  await queue.add('process-media', { mediaId, path: finalPath, mimeType: req.file.mimetype });
  res.status(201).json({ id: mediaId, sha256 });
});

app.listen(Number(process.env.API_PORT || 8080), () => {
  console.log('backend listening');
});
