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

CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_ann
  ON semantic_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_facial_embeddings_ann
  ON facial_embeddings
  USING hnsw (embedding vector_cosine_ops);
