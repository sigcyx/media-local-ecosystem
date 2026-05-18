# Technical Specification (Gate 3)

## 1. Purpose

This document locks implementation-level technical contracts for MVP:
- API contracts
- queue contracts
- authentication/authorization model
- observability standards

This spec is authoritative for Gate 4 ticket breakdown and subsequent implementation.

## 2. System Components

- `proxy` (Nginx): LAN ingress and route dispatch.
- `backend` (Node.js/Express): auth, upload ingest, metadata persistence, query APIs.
- `worker` (Node.js + BullMQ): async derivative generation and embedding persistence.
- `ai-service` (FastAPI): embedding inference interfaces.
- `postgres` (pgvector): relational + vector persistence.
- `redis`: queue broker/state backend.

## 3. Data Contracts and Schema Ownership

### 3.1 Canonical Tables
- `media_assets`
- `media_exif`
- `entities`
- `semantic_embeddings`
- `facial_embeddings`

### 3.2 SQL Query Interfaces
- `semantic_search(query_vector vector(512), limit_n int)`
- `facial_search(query_vector vector(512), limit_n int)`
- `entity_timeline(entity_id uuid)`
- `v_entity_timeline`

### 3.3 Contract Rules
- Asset UUID is the stable cross-service asset identifier.
- `sha256_hash` is immutable and dedupe authoritative.
- Source paths are write-once per asset in MVP.
- All timestamp fields use UTC `TIMESTAMPTZ`.

## 4. API Contracts

Base path: `/api`
Content type: `application/json` unless multipart upload.

### 4.1 Authentication

#### `POST /api/auth/login`
Request:
```json
{ "email": "user@example.com", "password": "secret" }
```
Response:
```json
{ "access_token": "jwt", "expires_in": 3600, "token_type": "Bearer" }
```

#### `POST /api/auth/refresh`
Request:
```json
{ "refresh_token": "opaque-or-jwt" }
```
Response same shape as login.

#### `POST /api/auth/logout`
Response:
```json
{ "ok": true }
```

### 4.2 Upload and Ingestion

#### `POST /api/upload`
Multipart form:
- `file` (required)
- `client_generated_at` (optional ISO 8601)
- `device_id` (optional)

Success response:
```json
{ "id": "uuid", "sha256": "hex", "duplicate": false }
```
Duplicate response:
```json
{ "sha256": "hex", "duplicate": true }
```

Error codes:
- `400` invalid file/metadata
- `401` unauthenticated
- `413` payload too large
- `415` unsupported media
- `500` ingestion failure

### 4.3 Timeline and Asset Retrieval

#### `GET /api/timeline?cursor=<cursor>&limit=<n>&status=<optional>`
Response:
```json
{
  "items": [{
    "asset_id": "uuid",
    "file_path": "string",
    "mime_type": "string",
    "captured_at": "timestamp-or-null",
    "created_at": "timestamp",
    "thumbnail_url": "string",
    "processing_status": "queued|processing|ready|failed|duplicate"
  }],
  "next_cursor": "opaque-or-null"
}
```

#### `GET /api/assets/:assetId`
Returns media/exif metadata for detail panel.

#### `GET /api/assets/:assetId/thumbnail`
Returns derivative thumbnail bytes (`image/jpeg`).

### 4.4 Semantic Search

#### `POST /api/search/semantic`
Request:
```json
{ "query": "orange cat sleeping", "limit": 20 }
```
Response:
```json
{
  "results": [{
    "asset_id": "uuid",
    "file_path": "string",
    "mime_type": "string",
    "captured_at": "timestamp-or-null",
    "distance": 0.123,
    "thumbnail_url": "string"
  }]
}
```

Execution path:
1. Backend calls AI service text encoder.
2. Backend calls DB function `semantic_search(...)`.
3. Backend returns ranked results.

### 4.5 Face Labeling and Entity APIs

#### `GET /api/assets/:assetId/faces`
#### `POST /api/faces/:facialEmbeddingId/assign-entity`
Request:
```json
{ "entity_id": "uuid" }
```

#### `POST /api/entities`
Request:
```json
{ "name": "Lemon", "is_pet": true }
```

#### `GET /api/entities`
Returns entity directory with counts.

#### `GET /api/entities/:entityId/timeline?cursor=<cursor>&limit=<n>`
Backed by `entity_timeline(entity_id)`.

### 4.6 Upload Activity

#### `GET /api/uploads/activity?limit=<n>`
Returns processing lifecycle snapshots and failures.

### 4.7 Health and Readiness

#### `GET /api/health`
Liveness of backend process.

#### `GET /api/ready`
Composite readiness requiring:
- Postgres connectivity
- Redis connectivity
- AI service connectivity (optional soft check in MVP)

## 5. Queue Contracts (Redis + BullMQ)

Queue name: `media-processing`

### 5.1 Job: `process-media`
Payload:
```json
{
  "mediaId": "uuid",
  "path": "/media/source/<sha>.jpg",
  "mimeType": "image/jpeg",
  "ingestedAt": "2026-05-18T13:00:00Z"
}
```

### 5.2 Job Options
- `attempts`: 5
- `backoff`: exponential, starting at 5000 ms
- `removeOnComplete`: 1000
- `removeOnFail`: 5000
- `timeout`: 120000 ms

### 5.3 Processing Stages
1. validate source asset and DB record
2. generate thumbnail/proxy derivatives
3. call AI service for embeddings
4. persist semantic embedding
5. persist facial embeddings when available
6. emit completion/failure event

### 5.4 Failure Handling
- Retry transient errors up to attempts limit.
- Permanent errors marked failed with `last_error` persisted.
- Optional dead-letter queue in post-MVP (`media-processing-dlq`).

## 6. AI Service Contracts

Base URL: `AI_SERVICE_URL`

### 6.1 `POST /embed`
Request:
```json
{ "media_id": "uuid", "path": "/media/source/file.jpg" }
```
Response:
```json
{
  "media_id": "uuid",
  "clip_embedding": "[...512 floats...]",
  "face_embeddings": [
    {
      "bounding_box": { "x": 0.1, "y": 0.2, "width": 0.2, "height": 0.2 },
      "embedding": "[...512 floats...]"
    }
  ]
}
```

### 6.2 `POST /embed/text`
Request:
```json
{ "query": "orange cat sleeping" }
```
Response:
```json
{ "embedding": "[...512 floats...]" }
```

Contract guarantees:
- Embedding dimensionality fixed to 512 in MVP.
- Non-200 responses include error code and message.

## 7. Auth and Authorization Model

### 7.1 Auth Scheme
- Bearer JWT access token (1 hour TTL).
- Refresh token (30 day TTL), revocable.
- Password auth for MVP (local users table).

### 7.2 Authorization Rules (MVP)
- All `/api/*` endpoints require authenticated user except `/api/health`.
- Single-tenant role model in MVP:
- `admin`: full access
- `user`: upload/search/view/label

### 7.3 Device Auth (Android)
- Device uses user access token.
- Optional device identifier header: `X-Device-Id`.
- Token refresh handled in background worker before upload attempts.

### 7.4 Security Requirements
- TLS required on LAN/VPN ingress.
- Passwords stored with Argon2id.
- Rate limiting on auth endpoints.
- Request size limits and MIME allow-list on upload.

## 8. Observability Specification

### 8.1 Logging
Structured JSON logs required for backend/worker/ai-service.

Required fields:
- `timestamp`
- `level`
- `service`
- `message`
- `request_id` (API)
- `job_id` (worker)
- `asset_id` (when applicable)
- `duration_ms`
- `error_code` and `error_message` (on failure)

### 8.2 Metrics

Backend metrics:
- `http_requests_total{route,method,status}`
- `http_request_duration_ms{route,method}`
- `upload_requests_total{result=accepted|duplicate|failed}`

Worker metrics:
- `jobs_processed_total{job,status}`
- `job_duration_ms{job}`
- `job_retries_total{job}`
- `queue_depth{queue}`

Search metrics:
- `semantic_search_total{result=ok|empty|error}`
- `semantic_search_duration_ms`
- `semantic_search_result_count`

AI metrics:
- `ai_inference_duration_ms{type=image|text}`
- `ai_inference_failures_total{type}`

### 8.3 Tracing
- Propagate `X-Request-Id` through proxy -> backend -> worker -> ai-service.
- Include request/job correlation id in all logs.

### 8.4 Alerting Thresholds (MVP)
- Job failure rate > 2% over 15 minutes.
- P95 semantic search latency > 500 ms over 15 minutes.
- Upload API 5xx rate > 1% over 10 minutes.
- Queue depth > 500 for > 10 minutes.

## 9. Performance and Scaling Targets

- Target library size for MVP validation: 100k assets.
- Semantic top-20 query P95: <= 500 ms.
- Upload accept+enqueue P95: <= 800 ms for <= 25 MB images.
- Worker concurrency default: 2 (configurable by env).

## 10. Configuration and Environment Variables

Required:
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `REDIS_URL`
- `AI_SERVICE_URL`
- `SOURCE_MEDIA_PATH`
- `DERIVED_MEDIA_PATH`
- `API_PORT`

Auth:
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_TTL_SECONDS` (default 3600)
- `JWT_REFRESH_TTL_SECONDS` (default 2592000)

Operational:
- `MAX_UPLOAD_MB`
- `ALLOWED_MIME_TYPES`
- `WORKER_CONCURRENCY`

## 11. Testability and Contract Verification Requirements

- API contract tests for all endpoints in Section 4.
- Queue contract tests validating payload schema and retry behavior.
- AI contract tests validating 512-dim embedding lengths.
- SQL function tests for `semantic_search`, `facial_search`, `entity_timeline`.
- End-to-end ingest test: upload -> queue -> thumbnail -> semantic row persisted.

## 12. Known Open Decisions (Must Resolve Before Gate 4 Finalization)

1. Auth storage schema details (`users`, `sessions`, token revocation model).
2. Whether `face_embeddings` are produced in MVP or staged as post-MVP toggle.
3. Exact upload activity persistence mechanism (dedicated table vs derived from queue events).
4. Optional reverse geocoding integration timing for MVP.

## 13. Gate 3 Exit Criteria

Gate 3 is complete when:
- API contracts are documented and versioned in this spec.
- Queue payload schemas/options are locked.
- Auth model and endpoint protection policy are locked.
- Observability fields/metrics/alerts are defined.
- Open decisions are either resolved or explicitly deferred with owner/date.
