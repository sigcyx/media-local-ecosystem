# Ticket Breakdown (Gate 4)

## Legend
- Est: S (1-2d), M (3-4d), L (5+d)
- Owner: BE (backend), FE (frontend), ML (ai-service), MB (mobile), OP (ops)

## Foundation and Security

### A1. Auth DB schema and password storage
- Owner: BE
- Est: M
- Depends on: none
- Scope: add users/sessions tables, Argon2id password hashing, seed admin path.
- Acceptance:
1. Users and refresh sessions persist in Postgres.
2. Passwords never stored plaintext.
3. DB migration is repeatable.

### A2. JWT auth endpoints
- Owner: BE
- Est: M
- Depends on: A1
- Scope: `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`.
- Acceptance:
1. Access/refresh issuance follows TECH_SPEC TTLs.
2. Revoked refresh token rejected.
3. Error responses match contract.

### A3. Auth middleware and route protection
- Owner: BE
- Est: S
- Depends on: A2
- Scope: protect all `/api/*` except health.
- Acceptance:
1. Unauthorized requests return 401.
2. Authorized requests pass with user context.

### A4. Request ID propagation baseline
- Owner: BE
- Est: S
- Depends on: none
- Scope: `X-Request-Id` generation/forwarding and log inclusion.
- Acceptance:
1. Every API response has `X-Request-Id`.
2. Logs include correlation ids.

## Ingestion and Pipeline

### P1. Upload hardening
- Owner: BE
- Est: M
- Depends on: A3
- Scope: enforce max size, MIME allow-list, input validation.
- Acceptance:
1. Oversize rejected with 413.
2. Unsupported MIME rejected with 415.

### P2. Queue retry/backoff contract
- Owner: BE
- Est: S
- Depends on: P1
- Scope: BullMQ attempts/backoff/timeout/remove policies per TECH_SPEC.
- Acceptance:
1. Failed jobs retry as configured.
2. Retry count observable in logs.

### P3. Upload activity persistence
- Owner: BE
- Est: M
- Depends on: P2
- Scope: table + status transitions (`queued/processing/ready/failed/duplicate`).
- Acceptance:
1. Activity records exist for each upload.
2. Final status reflects pipeline outcome.

### P4. Timeline API completion
- Owner: BE
- Est: M
- Depends on: P3
- Scope: cursor pagination, status filtering, thumbnail URL generation.
- Acceptance:
1. Contract matches DESIGN_SPEC.
2. Pagination deterministic.

### P5. Worker derivative and status updates
- Owner: BE
- Est: M
- Depends on: P3
- Scope: thumbnail generation + upload activity stage updates + failure reason storage.
- Acceptance:
1. Status transitions visible in API.
2. Failed jobs record actionable error text.

## Search and Face Features

### S1. AI text embedding endpoint
- Owner: ML
- Est: M
- Depends on: none
- Scope: `POST /embed/text` returns 512-d embedding.
- Acceptance:
1. Response dimension validated at runtime.
2. Non-200 errors include structured error code/message.

### S2. Semantic search backend endpoint
- Owner: BE
- Est: M
- Depends on: S1, P4
- Scope: `POST /api/search/semantic` using `semantic_search(...)` SQL function.
- Acceptance:
1. Ranked results returned with distance.
2. Empty results and errors handled per contract.

### F1. Asset faces retrieval endpoint
- Owner: BE
- Est: M
- Depends on: P4
- Scope: `GET /api/assets/:assetId/faces`.
- Acceptance:
1. Returns bounding boxes and entity linkage.

### F2. Entity CRUD (MVP subset)
- Owner: BE
- Est: M
- Depends on: A3
- Scope: `POST /api/entities`, `GET /api/entities`.
- Acceptance:
1. Name and pet flag persisted.
2. Duplicate name handling defined and tested.

### F3. Face-to-entity assignment
- Owner: BE
- Est: S
- Depends on: F1, F2
- Scope: `POST /api/faces/:facialEmbeddingId/assign-entity`.
- Acceptance:
1. Assignment persists and is reflected in subsequent reads.

### F4. Entity timeline endpoint
- Owner: BE
- Est: S
- Depends on: F2, F3
- Scope: `GET /api/entities/:entityId/timeline` via SQL function.
- Acceptance:
1. Chronological output and pagination behavior verified.

## Web MVP

### W1. Web app scaffold and routing
- Owner: FE
- Est: M
- Depends on: A3
- Scope: shell, nav, route setup for Timeline/Search/Entities/Uploads/Settings.
- Acceptance:
1. Route-level code splitting and error boundaries in place.

### W2. Search view implementation
- Owner: FE
- Est: M
- Depends on: S2
- Scope: semantic query UI + results rendering + states.
- Acceptance:
1. Loading/empty/error states match DESIGN_SPEC.

### W3. Entity directory and timeline views
- Owner: FE
- Est: M
- Depends on: F2, F4
- Scope: entity listing + per-entity timeline.
- Acceptance:
1. Entity counts and chronological assets display correctly.

### W4. Media detail and face labeling UI
- Owner: FE
- Est: M
- Depends on: F1, F3
- Scope: face boxes, assignment controls, create-entity flow.
- Acceptance:
1. Face labeling updates reflected without full-page reload.

### W5. Upload activity view
- Owner: FE
- Est: M
- Depends on: P3
- Scope: activity table/cards with status badges and retry cues.
- Acceptance:
1. Duplicate/processing/failed states visible and distinguishable.

### W6. Accessibility and responsive pass
- Owner: FE
- Est: M
- Depends on: W1-W5
- Scope: keyboard nav, focus states, contrast checks, mobile layout behavior.
- Acceptance:
1. Baseline WCAG 2.1 AA checks pass for MVP screens.

## Android MVP

### M1. Android project scaffold + auth session storage
- Owner: MB
- Est: M
- Depends on: A2
- Scope: login/session handling, secure token storage.
- Acceptance:
1. Access token refresh works during background sync.

### M2. WorkManager media observation
- Owner: MB
- Est: M
- Depends on: M1
- Scope: detect new media, hash locally, queue upload jobs.
- Acceptance:
1. New DCIM items enqueue exactly once.

### M3. Trusted network policy
- Owner: MB
- Est: M
- Depends on: M2
- Scope: SSID/VPN gating logic.
- Acceptance:
1. Upload only on allowed network states.

### M4. Retry/backoff and sync status UI
- Owner: MB
- Est: M
- Depends on: M2, P1
- Scope: failure retries and local status list.
- Acceptance:
1. Failed syncs retried with bounded backoff.

### M5. Android-to-backend e2e validation
- Owner: MB
- Est: S
- Depends on: M3, M4, P5
- Scope: verify real upload + duplicate behavior.
- Acceptance:
1. Test run shows accepted and duplicate flows.

## Observability and Release

### O1. Structured logging implementation
- Owner: BE/ML
- Est: M
- Depends on: A4
- Scope: standardized log schema across services.
- Acceptance:
1. Logs include required fields from TECH_SPEC.

### O2. Metrics instrumentation
- Owner: BE/ML
- Est: M
- Depends on: O1
- Scope: HTTP, queue, search, inference metrics.
- Acceptance:
1. Metrics endpoints expose required counters/histograms.

### O3. Alert rules and dashboard baseline
- Owner: OP
- Est: M
- Depends on: O2
- Scope: implement MVP alert thresholds and operational dashboard.
- Acceptance:
1. Alerts fire in synthetic failure tests.

### Q1. API and contract test suite
- Owner: BE
- Est: M
- Depends on: A3, P4, S2, F4
- Scope: endpoint and payload validation tests.
- Acceptance:
1. CI fails on contract drift.

### Q2. Queue and worker integration tests
- Owner: BE
- Est: M
- Depends on: P2, P5
- Scope: retry/failure/success stage tests.
- Acceptance:
1. Deterministic pass for retry and failure cases.

### Q3. End-to-end ingest->search tests
- Owner: BE/FE
- Est: M
- Depends on: S2, W2
- Scope: upload, process, search, result verification.
- Acceptance:
1. Full path validated in CI/staging environment.

### Q4. Performance benchmark suite
- Owner: OP/BE
- Est: M
- Depends on: O2, S2
- Scope: query latency and upload response KPI checks.
- Acceptance:
1. KPI pass/fail report generated from benchmark run.

### R1. Release readiness and rollback runbook
- Owner: OP
- Est: S
- Depends on: Q1-Q4, O3
- Scope: final go/no-go checklist and rollback steps.
- Acceptance:
1. Explicit ship recommendation with residual risk summary.
