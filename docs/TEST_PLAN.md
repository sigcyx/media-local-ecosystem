# Test Plan (Gate 4)

## 1. Test Strategy

Validation scope covers:
- contract correctness
- functional behavior
- integration reliability
- performance against PRD KPIs
- release safety and rollback confidence

## 2. Requirement Traceability Matrix

### PRD / TECH_SPEC Requirement -> Test Coverage

1. Deduplicated upload ingestion -> Unit + Integration + E2E
2. EXIF metadata persistence -> Integration
3. Async queue processing with retries -> Integration
4. Semantic search ranking via cosine distance -> Contract + Integration + Perf
5. Facial search and entity timeline query interfaces -> Contract + Integration
6. Authenticated API protection -> Unit + Contract
7. Observability fields/metrics/alerts -> Integration + Ops validation

## 3. Test Levels

### 3.1 Unit Tests

Backend:
- hash generation and duplicate detection branches
- MIME/size validation
- auth token verification and expiry behavior
- request-id middleware behavior

Worker:
- job payload validation
- retry/backoff option initialization
- status transition mapping

AI service:
- embedding response shape validation
- dimensionality checks (512)

SQL:
- function output shape checks (`semantic_search`, `facial_search`, `entity_timeline`)

### 3.2 Contract Tests

API:
- endpoint request/response schemas
- status code and error envelope consistency
- pagination cursor behavior

Queue:
- `process-media` payload schema validation
- required fields: `mediaId`, `path`, `mimeType`, `ingestedAt`

AI:
- `/embed` and `/embed/text` payload and dimension validation

### 3.3 Integration Tests

- upload accepted -> DB write -> queue enqueue
- duplicate upload -> no duplicate asset insert
- worker consumes job -> thumbnail + semantic row + status updates
- face assignment updates entity linkage
- entity timeline endpoint returns ordered results

### 3.4 End-to-End Tests

- Web: upload visibility -> processing -> ready state transition
- Web: semantic query returns expected known asset in top-k
- Web: face assignment reflected in entity timeline
- Android: trusted-network upload and duplicate detection path

### 3.5 Performance Tests

- semantic search P95 <= 500 ms at 100k assets
- upload accept+enqueue P95 <= 800 ms for <= 25 MB images
- queue drain rate under burst scenario (1000 ingest events)

## 4. Test Data Plan

- fixture media set with varied EXIF/GPS presence
- known duplicate files for dedupe assertions
- curated semantic pairs for relevance sanity checks
- face fixture set with known identities (person + pet)

## 5. Environments

- Local CI compose stack (postgres, redis, backend, worker, ai-service)
- Staging homelab mirror environment for soak/perf tests

## 6. Entry and Exit Criteria

### Entry Criteria
- Gate 3 spec merged
- required endpoints/jobs implemented for target phase
- test fixtures available

### Exit Criteria
- all critical contract tests pass
- no open Sev-1/Sev-2 defects
- KPI benchmarks pass or have approved waivers
- release checklist signed off

## 7. Defect Severity Policy

- Sev-1: data loss, auth bypass, major corruption -> no-ship
- Sev-2: core flow broken (upload/search/sync) -> no-ship unless waived by owner
- Sev-3: non-core degradation with workaround -> may ship with mitigation
- Sev-4: cosmetic/non-blocking issues -> backlog

## 8. Ownership

- BE: API, queue, DB and integration tests
- FE: UI behavior and accessibility tests
- MB: Android sync behavior tests
- OP: performance, alerting, release readiness validation

## 9. Reporting

Each test cycle publishes:
- pass/fail summary by layer
- defect list by severity
- KPI report
- release recommendation delta
