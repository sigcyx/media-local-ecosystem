CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256_hash VARCHAR(64) UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_exif (
  media_id UUID PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  camera_model TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  shutter_speed TEXT,
  iso INTEGER
);

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  is_pet BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_jti UUID NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS upload_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES media_assets(id) ON DELETE CASCADE,
  sha256_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'duplicate')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS semantic_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  embedding VECTOR(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id)
);

CREATE TABLE IF NOT EXISTS facial_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  bounding_box JSONB NOT NULL,
  embedding VECTOR(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_sha256_hash ON media_assets (sha256_hash);
CREATE INDEX IF NOT EXISTS idx_media_assets_captured_at ON media_assets (captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_exif_gps ON media_exif (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_asset_id ON semantic_embeddings (asset_id);
CREATE INDEX IF NOT EXISTS idx_facial_embeddings_asset_id ON facial_embeddings (asset_id);
CREATE INDEX IF NOT EXISTS idx_facial_embeddings_entity_id ON facial_embeddings (entity_id);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user_id ON refresh_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires_at ON refresh_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_upload_activity_asset_id ON upload_activity (asset_id);
CREATE INDEX IF NOT EXISTS idx_upload_activity_sha256_hash ON upload_activity (sha256_hash);
CREATE INDEX IF NOT EXISTS idx_upload_activity_status ON upload_activity (status);
CREATE INDEX IF NOT EXISTS idx_upload_activity_updated_at ON upload_activity (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_ann
  ON semantic_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_facial_embeddings_ann
  ON facial_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION semantic_search(query_vector vector(512), limit_n INTEGER DEFAULT 20)
RETURNS TABLE (
  asset_id UUID,
  file_path TEXT,
  mime_type VARCHAR(50),
  captured_at TIMESTAMPTZ,
  distance DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id AS asset_id,
    m.file_path,
    m.mime_type,
    m.captured_at,
    (s.embedding <=> query_vector) AS distance
  FROM semantic_embeddings s
  JOIN media_assets m ON m.id = s.asset_id
  ORDER BY s.embedding <=> query_vector
  LIMIT GREATEST(limit_n, 1);
$$;

CREATE OR REPLACE FUNCTION facial_search(query_vector vector(512), limit_n INTEGER DEFAULT 20)
RETURNS TABLE (
  facial_embedding_id UUID,
  asset_id UUID,
  entity_id UUID,
  entity_name VARCHAR(255),
  bounding_box JSONB,
  captured_at TIMESTAMPTZ,
  distance DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.id AS facial_embedding_id,
    f.asset_id,
    f.entity_id,
    e.name AS entity_name,
    f.bounding_box,
    m.captured_at,
    (f.embedding <=> query_vector) AS distance
  FROM facial_embeddings f
  JOIN media_assets m ON m.id = f.asset_id
  LEFT JOIN entities e ON e.id = f.entity_id
  ORDER BY f.embedding <=> query_vector
  LIMIT GREATEST(limit_n, 1);
$$;

CREATE OR REPLACE FUNCTION entity_timeline(entity_id UUID)
RETURNS TABLE (
  asset_id UUID,
  entity_id UUID,
  entity_name VARCHAR(255),
  file_path TEXT,
  mime_type VARCHAR(50),
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  face_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id AS asset_id,
    e.id AS entity_id,
    e.name AS entity_name,
    m.file_path,
    m.mime_type,
    m.captured_at,
    m.created_at,
    COUNT(f.id) AS face_count
  FROM entities e
  JOIN facial_embeddings f ON f.entity_id = e.id
  JOIN media_assets m ON m.id = f.asset_id
  WHERE e.id = entity_timeline.entity_id
  GROUP BY e.id, e.name, m.id, m.file_path, m.mime_type, m.captured_at, m.created_at
  ORDER BY m.captured_at DESC NULLS LAST, m.created_at DESC;
$$;

CREATE OR REPLACE VIEW v_entity_timeline AS
SELECT
  e.id AS entity_id,
  e.name AS entity_name,
  m.id AS asset_id,
  m.file_path,
  m.mime_type,
  m.captured_at,
  m.created_at,
  COUNT(f.id) AS face_count
FROM entities e
JOIN facial_embeddings f ON f.entity_id = e.id
JOIN media_assets m ON m.id = f.asset_id
GROUP BY e.id, e.name, m.id, m.file_path, m.mime_type, m.captured_at, m.created_at;
