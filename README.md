# Autonomous Local Media Ecosystem

A self-hosted, LAN-first media platform that delivers cloud-like UX while keeping data local.

## System Goals
- Real-time mobile sync from trusted devices
- Immutable source media strategy
- AI-powered search (faces, semantic content, location)
- Decoupled microservices with async processing

## Architecture Summary
- **Infrastructure tier**: Docker stack inside an LXC, reverse proxy (Nginx), Redis queueing
- **Storage tier**: NAS mounted to containers (NFS/SMB), source media read-only, derivatives written separately
- **Data tier**: PostgreSQL + `pgvector` for metadata and embeddings
- **ML tier**: FastAPI service for CLIP + FaceNet/DeepFace embedding generation
- **Clients**: Web app + native Android uploader with WorkManager and network-aware sync

Detailed blueprint: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)

## Quick Start
1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Create NAS directories and mount points on host.
3. Start stack:
   ```bash
   docker compose up -d --build
   ```
4. Open API via reverse proxy endpoint.

## Monorepo Layout
- `infra/` reverse proxy and infra assets
- `backend/` Node.js/Express API service
- `worker/` async media processing worker
- `ai-service/` Python FastAPI ML microservice
- `web/` frontend scaffold (placeholder)
- `android/` Android sync client scaffold (placeholder)
- `docs/` architecture and execution roadmap
