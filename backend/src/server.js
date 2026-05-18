import express from 'express';
import multer from 'multer';
import exifr from 'exifr';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { verify as verifyArgon2 } from '@node-rs/argon2';
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
const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://ai-service:8000';
const apiPort = Number(process.env.API_PORT || 8080);
const jwtAccessSecret = process.env.JWT_ACCESS_SECRET || 'dev-access-secret';
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const accessTtlSeconds = Number(process.env.JWT_ACCESS_TTL_SECONDS || 3600);
const refreshTtlSeconds = Number(process.env.JWT_REFRESH_TTL_SECONDS || 2592000);

app.use(express.json());

app.use((req, res, next) => {
  const requestId = req.header('X-Request-Id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

function log(level, message, extra = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: 'backend',
    message,
    ...extra
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

function encodeCursor(sortTs, assetId) {
  return Buffer.from(JSON.stringify({ sortTs, assetId })).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed.sortTs || !parsed.assetId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, type: 'access' },
    jwtAccessSecret,
    { expiresIn: accessTtlSeconds }
  );
}

function signRefreshToken(user, tokenJti) {
  return jwt.sign(
    { sub: user.id, role: user.role, type: 'refresh', jti: tokenJti },
    jwtRefreshSecret,
    { expiresIn: refreshTtlSeconds }
  );
}

async function createSessionAndTokens(user) {
  const tokenJti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);
  await pool.query(
    `INSERT INTO refresh_sessions (user_id, token_jti, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenJti, expiresAt]
  );

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, tokenJti);
  return { accessToken, refreshToken };
}

function authMiddleware(req, res, next) {
  const publicPaths = ['/health', '/auth/login', '/auth/refresh'];
  if (publicPaths.includes(req.path)) return next();

  const auth = req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  try {
    const decoded = jwt.verify(token, jwtAccessSecret);
    if (decoded.type !== 'access') return res.status(401).json({ error: 'unauthorized' });
    req.user = { id: decoded.sub, role: decoded.role, email: decoded.email };
    return next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

app.use(authMiddleware);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ready' });
  } catch (error) {
    log('error', 'readiness check failed', { request_id: req.requestId, error_message: String(error) });
    return res.status(503).json({ status: 'not_ready' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const userResult = await pool.query(
    `SELECT id, email, password_hash, role, is_active
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email]
  );

  if (userResult.rowCount === 0) return res.status(401).json({ error: 'invalid credentials' });
  const user = userResult.rows[0];
  if (!user.is_active) return res.status(403).json({ error: 'user disabled' });

  const valid = await verifyArgon2(user.password_hash, password).catch(() => false);
  if (!valid) return res.status(401).json({ error: 'invalid credentials' });

  const { accessToken, refreshToken } = await createSessionAndTokens(user);
  return res.json({ access_token: accessToken, refresh_token: refreshToken, expires_in: accessTtlSeconds, token_type: 'Bearer' });
});

app.post('/auth/refresh', async (req, res) => {
  const { refresh_token: refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refresh_token is required' });

  try {
    const decoded = jwt.verify(refreshToken, jwtRefreshSecret);
    if (decoded.type !== 'refresh' || !decoded.jti) return res.status(401).json({ error: 'invalid refresh token' });

    const session = await pool.query(
      `SELECT rs.id, rs.user_id, rs.token_jti, rs.expires_at, rs.revoked_at, u.email, u.role, u.is_active
       FROM refresh_sessions rs
       JOIN users u ON u.id = rs.user_id
       WHERE rs.token_jti = $1
       LIMIT 1`,
      [decoded.jti]
    );

    if (session.rowCount === 0) return res.status(401).json({ error: 'invalid refresh token' });
    const row = session.rows[0];

    if (row.revoked_at || new Date(row.expires_at) < new Date() || !row.is_active) {
      return res.status(401).json({ error: 'invalid refresh token' });
    }

    await pool.query('UPDATE refresh_sessions SET revoked_at = NOW() WHERE id = $1', [row.id]);
    const user = { id: row.user_id, email: row.email, role: row.role };
    const tokens = await createSessionAndTokens(user);
    return res.json({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken, expires_in: accessTtlSeconds, token_type: 'Bearer' });
  } catch {
    return res.status(401).json({ error: 'invalid refresh token' });
  }
});

app.post('/auth/logout', async (req, res) => {
  const { refresh_token: refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refresh_token is required' });

  try {
    const decoded = jwt.verify(refreshToken, jwtRefreshSecret);
    if (decoded?.jti) {
      await pool.query('UPDATE refresh_sessions SET revoked_at = NOW() WHERE token_jti = $1 AND revoked_at IS NULL', [decoded.jti]);
    }
  } catch {
    return res.status(401).json({ error: 'invalid refresh token' });
  }

  return res.json({ ok: true });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const tempPath = req.file.path;
  const buffer = await fs.readFile(tempPath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const ext = path.extname(req.file.originalname || '');
  const filename = `${sha256}${ext}`;
  const finalPath = path.join(sourceRoot, filename);

  const existing = await pool.query('SELECT id FROM media_assets WHERE sha256_hash = $1 LIMIT 1', [sha256]);
  if (existing.rowCount > 0) {
    const existingAssetId = existing.rows[0].id;
    await pool.query(
      `INSERT INTO upload_activity (asset_id, sha256_hash, status)
       VALUES ($1, $2, 'duplicate')`,
      [existingAssetId, sha256]
    );
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

  const activity = await pool.query(
    `INSERT INTO upload_activity (asset_id, sha256_hash, status)
     VALUES ($1, $2, 'queued')
     RETURNING id`,
    [mediaId, sha256]
  );

  const activityId = activity.rows[0].id;
  await queue.add('process-media', {
    mediaId,
    activityId,
    path: finalPath,
    mimeType: req.file.mimetype,
    ingestedAt: new Date().toISOString()
  });
  return res.status(201).json({ id: mediaId, sha256 });
});

app.get('/timeline', async (req, res) => {
  const limitRaw = Number(req.query.limit || 30);
  const limit = Number.isNaN(limitRaw) ? 30 : Math.min(Math.max(limitRaw, 1), 100);
  const status = req.query.status ? String(req.query.status) : null;
  const cursor = req.query.cursor ? decodeCursor(String(req.query.cursor)) : null;

  const params = [limit + 1];
  let where = '';
  if (status) {
    params.push(status);
    where += ` AND COALESCE(la.status, 'ready') = $${params.length}`;
  }

  if (cursor) {
    params.push(cursor.sortTs);
    params.push(cursor.assetId);
    where += ` AND (
      COALESCE(m.captured_at, m.created_at) < $${params.length - 1}::timestamptz
      OR (
        COALESCE(m.captured_at, m.created_at) = $${params.length - 1}::timestamptz
        AND m.id < $${params.length}::uuid
      )
    )`;
  }

  const result = await pool.query(
    `WITH latest_activity AS (
       SELECT DISTINCT ON (asset_id)
         asset_id, status, last_error, updated_at
       FROM upload_activity
       WHERE asset_id IS NOT NULL
       ORDER BY asset_id, updated_at DESC
     )
     SELECT
       m.id AS asset_id,
       m.file_path,
       m.mime_type,
       m.captured_at,
       m.created_at,
       '/api/assets/' || m.id::text || '/thumbnail' AS thumbnail_url,
       COALESCE(la.status, 'ready') AS processing_status
     FROM media_assets m
     LEFT JOIN latest_activity la ON la.asset_id = m.id
     WHERE 1=1 ${where}
     ORDER BY COALESCE(m.captured_at, m.created_at) DESC, m.id DESC
     LIMIT $1`,
    params
  );

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  let nextCursor = null;
  if (hasMore && rows.length > 0) {
    const last = rows[rows.length - 1];
    nextCursor = encodeCursor(last.captured_at || last.created_at, last.asset_id);
  }

  return res.json({ items: rows, next_cursor: nextCursor });
});

app.get('/uploads/activity', async (req, res) => {
  const limitRaw = Number(req.query.limit || 50);
  const limit = Number.isNaN(limitRaw) ? 50 : Math.min(Math.max(limitRaw, 1), 200);
  const result = await pool.query(
    `SELECT
       asset_id,
       sha256_hash,
       status,
       last_error,
       updated_at
     FROM upload_activity
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.json({ items: result.rows });
});

app.post('/search/semantic', async (req, res) => {
  const query = String(req.body?.query || '').trim();
  const limitRaw = Number(req.body?.limit ?? 20);
  const limit = Number.isNaN(limitRaw) ? 20 : Math.min(Math.max(limitRaw, 1), 100);

  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  let embedding;
  try {
    const aiResponse = await fetch(`${aiServiceUrl}/embed/text`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': req.requestId
      },
      body: JSON.stringify({ query })
    });

    if (!aiResponse.ok) {
      const body = await aiResponse.text();
      log('error', 'ai text embedding request failed', {
        request_id: req.requestId,
        status_code: aiResponse.status,
        error_message: body
      });
      return res.status(502).json({ error: 'embedding service unavailable' });
    }

    const payload = await aiResponse.json();
    embedding = payload.embedding;
    if (!embedding) return res.status(502).json({ error: 'embedding service unavailable' });
  } catch (error) {
    log('error', 'ai text embedding request error', { request_id: req.requestId, error_message: String(error) });
    return res.status(502).json({ error: 'embedding service unavailable' });
  }

  const result = await pool.query(
    `SELECT asset_id, file_path, mime_type, captured_at, distance
     FROM semantic_search($1::vector, $2)`,
    [embedding, limit]
  );

  const items = result.rows.map((row) => ({
    ...row,
    thumbnail_url: `/api/assets/${row.asset_id}/thumbnail`
  }));

  return res.json({ results: items });
});

app.get('/assets/:assetId/faces', async (req, res) => {
  const { assetId } = req.params;
  if (!isUuid(assetId)) return res.status(400).json({ error: 'invalid assetId' });

  const result = await pool.query(
    `SELECT
       f.id AS facial_embedding_id,
       f.entity_id,
       e.name AS entity_name,
       f.bounding_box
     FROM facial_embeddings f
     LEFT JOIN entities e ON e.id = f.entity_id
     WHERE f.asset_id = $1
     ORDER BY f.created_at ASC`,
    [assetId]
  );

  return res.json({ faces: result.rows });
});

app.post('/entities', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const isPet = Boolean(req.body?.is_pet);
  if (!name) return res.status(400).json({ error: 'name is required' });

  const existing = await pool.query(
    `SELECT id FROM entities WHERE lower(name) = lower($1) LIMIT 1`,
    [name]
  );
  if (existing.rowCount > 0) {
    return res.status(409).json({ error: 'entity already exists' });
  }

  const inserted = await pool.query(
    `INSERT INTO entities (name, is_pet)
     VALUES ($1, $2)
     RETURNING id`,
    [name, isPet]
  );
  return res.status(201).json({ entity_id: inserted.rows[0].id });
});

app.get('/entities', async (req, res) => {
  const result = await pool.query(
    `SELECT
       e.id AS entity_id,
       e.name,
       e.is_pet,
       e.created_at,
       COUNT(f.id)::int AS face_count,
       MAX(COALESCE(m.captured_at, m.created_at)) AS latest_seen_at
     FROM entities e
     LEFT JOIN facial_embeddings f ON f.entity_id = e.id
     LEFT JOIN media_assets m ON m.id = f.asset_id
     GROUP BY e.id, e.name, e.is_pet, e.created_at
     ORDER BY e.name ASC`
  );
  return res.json({ items: result.rows });
});

app.post('/faces/:facialEmbeddingId/assign-entity', async (req, res) => {
  const { facialEmbeddingId } = req.params;
  const entityId = String(req.body?.entity_id || '');
  if (!isUuid(facialEmbeddingId)) return res.status(400).json({ error: 'invalid facialEmbeddingId' });
  if (!isUuid(entityId)) return res.status(400).json({ error: 'invalid entity_id' });

  const entity = await pool.query('SELECT id FROM entities WHERE id = $1 LIMIT 1', [entityId]);
  if (entity.rowCount === 0) return res.status(404).json({ error: 'entity not found' });

  const updated = await pool.query(
    `UPDATE facial_embeddings
     SET entity_id = $1
     WHERE id = $2
     RETURNING id`,
    [entityId, facialEmbeddingId]
  );
  if (updated.rowCount === 0) return res.status(404).json({ error: 'face not found' });

  return res.json({ ok: true });
});

app.get('/entities/:entityId/timeline', async (req, res) => {
  const { entityId } = req.params;
  if (!isUuid(entityId)) return res.status(400).json({ error: 'invalid entityId' });

  const limitRaw = Number(req.query.limit || 30);
  const limit = Number.isNaN(limitRaw) ? 30 : Math.min(Math.max(limitRaw, 1), 100);
  const cursor = req.query.cursor ? decodeCursor(String(req.query.cursor)) : null;

  const entityResult = await pool.query(
    `SELECT id AS entity_id, name, is_pet
     FROM entities
     WHERE id = $1
     LIMIT 1`,
    [entityId]
  );
  if (entityResult.rowCount === 0) return res.status(404).json({ error: 'entity not found' });

  const params = [entityId, limit + 1];
  let where = '';
  if (cursor) {
    params.push(cursor.sortTs);
    params.push(cursor.assetId);
    where += ` AND (
      COALESCE(t.captured_at, t.created_at) < $${params.length - 1}::timestamptz
      OR (
        COALESCE(t.captured_at, t.created_at) = $${params.length - 1}::timestamptz
        AND t.asset_id < $${params.length}::uuid
      )
    )`;
  }

  const timeline = await pool.query(
    `SELECT
       t.asset_id,
       t.file_path,
       t.mime_type,
       t.captured_at,
       t.created_at,
       t.face_count
     FROM entity_timeline($1) t
     WHERE 1=1 ${where}
     ORDER BY COALESCE(t.captured_at, t.created_at) DESC, t.asset_id DESC
     LIMIT $2`,
    params
  );

  const hasMore = timeline.rows.length > limit;
  const rows = hasMore ? timeline.rows.slice(0, limit) : timeline.rows;
  let nextCursor = null;
  if (hasMore && rows.length > 0) {
    const last = rows[rows.length - 1];
    nextCursor = encodeCursor(last.captured_at || last.created_at, last.asset_id);
  }

  const items = rows.map((row) => ({
    asset_id: row.asset_id,
    file_path: row.file_path,
    mime_type: row.mime_type,
    captured_at: row.captured_at,
    face_count: Number(row.face_count),
    thumbnail_url: `/api/assets/${row.asset_id}/thumbnail`
  }));

  return res.json({ entity: entityResult.rows[0], items, next_cursor: nextCursor });
});

app.listen(apiPort, () => {
  log('info', 'backend listening', { port: apiPort });
});
