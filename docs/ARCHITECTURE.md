# System Architecture and Technical Blueprint

## 1. Infrastructure & Orchestration Tier
- Runtime: Docker Compose deployment hosted inside LXC on a hypervisor.
- Reverse proxy: Nginx for internal routing and TLS termination.
- Broker: Redis for async job queue coordination.

### Rationale
- Container boundaries isolate failures and simplify upgrades.
- Queue-based job orchestration keeps API ingestion responsive during heavy media processing.

## 2. Storage Tier
- Primary storage: NAS mount attached into services (NFS/SMB).
- Source media: mounted read-only to enforce immutability.
- Derived assets: stored in separate writable structure.

### Mount Strategy
- `/mnt/nas/source` (read-only originals)
- `/mnt/nas/derived` (thumbnails, proxies, ML metadata)

## 3. Data & Metadata Tier
- PostgreSQL as source of truth for users, albums, EXIF, and file references.
- `pgvector` extension for CLIP and face embedding vectors.

### Core Tables
- `users`
- `albums`
- `media_assets`
- `media_exif`
- `ml_models`
- `media_semantic_embeddings`
- `face_detections`
- `face_embeddings`
- `face_clusters`
- `face_cluster_members`
- `face_clusters`

## 4. Intelligence Pipeline
Event-driven processing starts when media is ingested.

### Capabilities
- Facial recognition: FaceNet/DeepFace embeddings and clustering.
- Semantic search: CLIP embeddings for natural language image retrieval.
- Reverse geocoding: local Nominatim/offline geo database lookups from EXIF GPS.

### Flow
1. Backend ingests file metadata and enqueues processing jobs.
2. Worker generates thumbnail/proxy assets.
3. Worker calls AI service for CLIP and face embeddings.
4. Embeddings and derived metadata are persisted to PostgreSQL/pgvector.

## 5. Mobile Real-Time Synchronization
- Native Android app in Kotlin.
- WorkManager observes DCIM/media changes.
- Local hash computed pre-upload for dedupe.
- Upload active only on trusted local SSID or split-tunnel VPN connectivity.

## 6. Security Boundaries
- Internal LAN-only surface by default.
- API auth required for upload/search operations.
- Mount originals read-only in processing containers.
- Generated assets segregated by directory and service account permissions.
