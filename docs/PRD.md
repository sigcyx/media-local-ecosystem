# Product Requirements Document (PRD)

## 1. Product Summary

### Product Name
Autonomous Local Media Ecosystem

### One-Line Description
A local-first, self-hosted media platform that provides cloud-like photo/video backup and AI search while keeping all data under user control.

### Why Now
Users want Google Photos-class convenience without cloud lock-in, recurring subscription costs, or external data exposure. Affordable homelab hardware, pgvector, and modern local inference stacks make this practical.

## 2. Problem Statement

Consumers with NAS/homelab setups can store files locally, but they usually lack:
- reliable real-time mobile backup
- semantic search over photos/videos
- practical face clustering and tagging
- cohesive web/mobile UX across ingestion, discovery, and organization

Current alternatives force trade-offs: either strong UX with cloud dependency, or local storage with weak search and sync reliability.

## 3. Goals and Objectives

### Primary Goals
- Deliver reliable local-first media ingestion and backup.
- Enable natural-language media discovery using semantic embeddings.
- Enable face-based grouping and person/pet labeling workflows.
- Preserve source-file immutability and full local data sovereignty.

### Business/Value Goals
- Remove dependency on external cloud providers.
- Reduce long-term storage and subscription costs.
- Provide an extensible platform for future local AI features.

## 4. Target Users and Personas

### Persona A: Homelab Power User (Primary)
- Runs Proxmox/bare metal + NAS.
- Expects transparent infrastructure, observability, and configurability.
- Wants robust ingestion and search with no cloud egress.

### Persona B: Family Archivist (Secondary)
- Needs simple mobile auto-backup and fast retrieval.
- Values face search, date/location browse, and album sharing in LAN/VPN.

### Persona C: Privacy-Sensitive Creator (Secondary)
- Stores large media libraries.
- Requires local-only processing and deterministic retention control.

## 5. Scope

### In Scope (MVP)
- Backend upload API with deduplication by SHA-256.
- EXIF extraction and metadata persistence.
- Queue-driven asynchronous processing (thumbnail + semantic embedding persistence).
- PostgreSQL + pgvector schema and ANN cosine search.
- Semantic search API endpoint over stored embeddings.
- Facial embedding persistence model and query interface.
- Basic web app MVP: upload status, timeline, semantic search results.
- Android MVP scaffold for WorkManager-triggered sync on trusted network.
- LAN-first deployment via Docker Compose in LXC/bare metal.

### Out of Scope (MVP)
- Public internet multi-tenant SaaS mode.
- iOS client.
- Real-time collaborative albums/comments.
- Advanced video understanding (scene segmentation, OCR subtitles).
- Distributed multi-node storage orchestration.

## 6. Non-Goals

- Competing with hyperscaler-scale global search infrastructure.
- Replacing all DAM workflows for enterprise teams.
- Supporting every AI model runtime in v1.

## 7. User Stories

1. As a user, when I take a photo on my Android device on trusted Wi-Fi, it should upload automatically to my local server.
2. As a user, I can search "orange cat sleeping" and receive relevant photos quickly.
3. As a user, I can label a detected face/person once and reuse that label for future retrieval.
4. As a user, I can browse media chronologically with captured date fidelity.
5. As an admin, I can run the stack locally and verify service health, queue health, and DB health.

## 8. Functional Requirements

### FR-1 Ingestion and Deduplication
- System must accept photo/video uploads via authenticated API.
- System must compute SHA-256 before persistence.
- System must skip duplicate ingest when hash already exists.

### FR-2 Metadata Persistence
- System must store file path, MIME type, size, captured timestamp.
- System must parse and store EXIF camera and GPS metadata when present.

### FR-3 Async Processing
- System must enqueue processing jobs for derivative generation and embedding tasks.
- Worker failures must not block API upload completion.

### FR-4 Semantic Search
- System must support cosine-distance nearest-neighbor search against semantic embeddings.
- System must return ranked assets with distance score.

### FR-5 Facial Embeddings and Entity Timeline
- System must store facial embeddings and optional entity assignment.
- System must support nearest-neighbor facial matching.
- System must support per-entity timeline retrieval.

### FR-6 Local-First Deployment
- System must run fully on LAN-controlled infrastructure.
- Source media mount must be read-only to processing services.
- Derived assets must be stored separately from originals.

### FR-7 Android Sync Constraints
- Sync worker must run in background and retry safely.
- Upload should be gated by trusted SSID or VPN policy.

## 9. Non-Functional Requirements

### Performance
- P95 semantic search query latency: <= 500 ms for 100k assets on target hardware.
- P95 upload API response for enqueue success: <= 800 ms for <= 25 MB images.

### Reliability
- Job processing retry policy with bounded backoff.
- No data loss for accepted uploads under normal single-node failure recovery.

### Security and Privacy
- Local-only by default; no external cloud dependency required.
- Auth required for upload/search endpoints.
- Principle-of-least-privilege filesystem mounts.

### Observability
- Structured logs for API/worker/AI services.
- Health endpoints and queue depth visibility.

## 10. Success Metrics (KPIs)

### Adoption/Usage
- >= 90% of new mobile photos on trusted network synced within 2 minutes.
- >= 70% weekly active semantic search usage among active users.

### Quality
- Deduplication precision: 100% for identical-file reuploads.
- Semantic top-20 relevance judged acceptable in >= 80% of sampled queries.

### Reliability
- Background job success rate >= 99% over 7-day rolling window.

## 11. MVP Acceptance Criteria

1. A new image upload is persisted, deduplicated, EXIF-extracted, and enqueued without blocking.
2. Worker generates thumbnail and stores semantic embedding row for the asset.
3. `semantic_search(query_vector, limit_n)` returns ranked results with cosine distance.
4. `facial_search(query_vector, limit_n)` and `entity_timeline(entity_id)` execute successfully against test data.
5. Compose stack can be started on a clean host using documented env/config steps.
6. Basic web UI can display timeline and semantic search results from backend APIs.

## 12. Dependencies

- PostgreSQL with pgvector extension.
- Redis for queueing.
- NAS mount availability and permissions.
- CLIP/Face model runtime availability in AI service.
- Android WorkManager and network state APIs.

## 13. Constraints and Assumptions

### Constraints
- Initial deployment target is single-site LAN/VPN.
- Resource profile may be CPU-only in some environments.
- Docker Compose used initially instead of Kubernetes.

### Assumptions
- Users can provide trusted network identifiers and NAS paths.
- Operators can manage local certificates and reverse proxy config.

## 14. Risks and Mitigations

1. Model quality mismatch for user expectations.
Mitigation: model versioning, benchmark queries, configurable model swap.

2. Performance degradation with dataset growth.
Mitigation: HNSW tuning, indexing strategy, future partitioning plan.

3. Mobile background restrictions causing delayed sync.
Mitigation: explicit policy UI, retry/backoff, sync diagnostics.

4. Operational complexity for self-hosting users.
Mitigation: health dashboards, runbooks, sane defaults, guided setup docs.

## 15. Release Definition (MVP)

MVP is considered complete when:
- all acceptance criteria in Section 11 are validated,
- known Sev-1/Sev-2 defects are resolved or explicitly waived,
- deployment and rollback runbook exists,
- launch readiness produces a clear go/no-go decision.
