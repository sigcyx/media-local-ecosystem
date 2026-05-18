CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_path TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_exif (
  media_id UUID PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  camera_model TEXT,
  captured_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  shutter_speed TEXT,
  iso INTEGER
);

CREATE TABLE IF NOT EXISTS media_embeddings (
  media_id UUID PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  clip_embedding VECTOR(512),
  face_embedding VECTOR(512),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
