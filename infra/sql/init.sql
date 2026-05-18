CREATE EXTENSION IF NOT EXISTS pgcrypto;
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

CREATE TABLE IF NOT EXISTS ml_models (
  id BIGSERIAL PRIMARY KEY,
  model_key TEXT NOT NULL UNIQUE,
  modality TEXT NOT NULL,
  embedding_dim INTEGER NOT NULL,
  distance_metric TEXT NOT NULL CHECK (distance_metric IN ('cosine', 'l2', 'ip')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_semantic_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  model_id BIGINT NOT NULL REFERENCES ml_models(id) ON DELETE RESTRICT,
  embedding VECTOR(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (media_id, model_id)
);

CREATE TABLE IF NOT EXISTS face_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  bbox_x DOUBLE PRECISION NOT NULL,
  bbox_y DOUBLE PRECISION NOT NULL,
  bbox_w DOUBLE PRECISION NOT NULL,
  bbox_h DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS face_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  face_detection_id UUID NOT NULL UNIQUE REFERENCES face_detections(id) ON DELETE CASCADE,
  model_id BIGINT NOT NULL REFERENCES ml_models(id) ON DELETE RESTRICT,
  embedding VECTOR(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS face_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_label TEXT,
  canonical_embedding VECTOR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS face_cluster_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES face_clusters(id) ON DELETE CASCADE,
  face_detection_id UUID NOT NULL UNIQUE REFERENCES face_detections(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_exif_captured_at ON media_exif (captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_exif_gps ON media_exif (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_media_id ON media_semantic_embeddings (media_id);
CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_model_id ON media_semantic_embeddings (model_id);
CREATE INDEX IF NOT EXISTS idx_face_detections_media_id ON face_detections (media_id);
CREATE INDEX IF NOT EXISTS idx_face_embeddings_model_id ON face_embeddings (model_id);
CREATE INDEX IF NOT EXISTS idx_face_cluster_members_cluster_id ON face_cluster_members (cluster_id);

CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_ann
  ON media_semantic_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_ann
  ON face_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_face_clusters_ann
  ON face_clusters
  USING hnsw (canonical_embedding vector_cosine_ops);
