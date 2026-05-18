# Delivery Plan (Gate 4)

## 1. Objective

Convert approved product/design/technical specs into an executable implementation sequence with explicit dependencies, owners, and acceptance gates.

## 2. Delivery Constraints

- Single-site deployment (LAN/VPN), Docker Compose runtime.
- Small team execution (backend + frontend + mobile + ops shared responsibilities).
- Initial validation target: 100k assets performance profile.

## 3. Workstreams

- WS1: Platform + Security Foundation
- WS2: Ingestion + Processing Pipeline
- WS3: Neural Search + Entity Features
- WS4: Web MVP
- WS5: Android Sync MVP
- WS6: Observability + QA + Release

## 4. Phase Sequencing

### Phase A: Foundation (Week 1)
- Auth schema + JWT flow + middleware.
- Request correlation + base structured logging.
- Upload activity persistence model.

Exit criteria:
- Authenticated API access enforced.
- Baseline logs include `request_id` and service metadata.

### Phase B: Pipeline Hardening (Week 2)
- Upload API hardening (limits, MIME allow-list, dedupe correctness).
- Queue retry/backoff contract implementation.
- Timeline + upload activity APIs complete.

Exit criteria:
- Upload->queue path reliable with retries and status visibility.

### Phase C: Search + Faces (Week 3)
- AI `/embed/text` contract implemented.
- Semantic search endpoint wired to SQL function.
- Face APIs + entity creation/assignment + entity timeline endpoint.

Exit criteria:
- End-to-end semantic search and entity timeline usable from API.

### Phase D: Web MVP (Week 4)
- Implement Timeline/Search/Entities/Uploads/Settings screens.
- Implement loading/empty/error/offline/retry/processing states.
- Integrate all locked API contracts.

Exit criteria:
- Web MVP covers all MVP flows from Design Spec.

### Phase E: Android MVP + Validation (Week 5)
- Kotlin scaffold with WorkManager sync policy.
- Auth + upload + retry flow.
- Integration/e2e/perf validation and release checklist closure.

Exit criteria:
- Android trusted-network sync functioning.
- Gate 6/7 readiness evidence complete.

## 5. Critical Path

1. Auth foundation must land before web/mobile integration.
2. Upload activity persistence must land before pipeline visibility UI.
3. AI text embedding endpoint must land before semantic search UI.
4. Face/entity endpoints must land before entity UI features.
5. Observability must land before final perf/reliability sign-off.

## 6. Dependency Graph (High Level)

- Auth (`A1-A4`) -> Web (`W1-W6`) and Android (`M1-M5`)
- Upload activity (`P3`) -> Uploads UI (`W5`)
- Semantic search API (`S1-S3`) -> Search UI (`W2`)
- Face/entity APIs (`F1-F4`) -> Entities UI (`W3`, `W4`)
- Metrics/logging (`O1-O3`) -> Performance + release sign-off (`Q4`, `R1`)

## 7. Milestones and Decision Gates

- M1 (end Week 1): Secure API baseline
- M2 (end Week 2): Reliable ingestion/pipeline visibility
- M3 (end Week 3): Search + entity feature-complete APIs
- M4 (end Week 4): Web MVP complete
- M5 (end Week 5): Android MVP + launch readiness recommendation

## 8. Risks and Mitigation in Execution

1. AI runtime instability on CPU-only hosts.
Mitigation: model warmup checks, configurable timeouts, fallback queue retries.

2. Queue backlog growth under burst uploads.
Mitigation: tune worker concurrency, add queue depth alerts, batch backfill mode.

3. Scope creep in web/mobile UI.
Mitigation: strict adherence to MVP flows/states from DESIGN_SPEC.

4. Late discovery of contract mismatch.
Mitigation: contract tests introduced in Phase B and enforced in CI.
