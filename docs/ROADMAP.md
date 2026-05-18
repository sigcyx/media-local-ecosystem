# Development Roadmap & Phases

## Phase 1: Core Foundation
- Provision LXC + Docker runtime.
- Stand up PostgreSQL with pgvector.
- Implement Node.js/Express upload API.
- Parse and persist core EXIF metadata.
- Save originals to NAS path with immutable policy.

## Phase 2: Processing Queue
- Deploy Redis and queue abstraction.
- Add background worker for thumbnails and proxy generation.
- Use Sharp (images) and FFmpeg (video/media derivatives).
- Persist job status and processing telemetry.

## Phase 3: Neural Layer
- Deploy FastAPI inference service.
- Load CLIP and FaceNet/DeepFace pipeline.
- Return embeddings to backend/worker.
- Persist vectors in PostgreSQL via pgvector.
- Add similarity-search endpoints.

## Phase 4: Client Ecosystem
- Build web frontend (React or Vue).
- Implement timeline, search, and album surfaces.
- Scaffold Android app sync pipeline.
- Add WorkManager jobs, network policy checks, and secure API token flow.
