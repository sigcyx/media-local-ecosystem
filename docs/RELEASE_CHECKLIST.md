# Release Checklist (Gate 6/7)

## 1. Scope and Version Control

- [ ] Release tag and changelog prepared
- [ ] Scope matches PRD MVP acceptance criteria
- [ ] Deferred scope and known limitations documented

## 2. Quality Gates

- [ ] Unit test suite passing
- [ ] Contract test suite passing
- [ ] Integration test suite passing
- [ ] End-to-end smoke tests passing (web + android critical paths)
- [ ] No open Sev-1 defects
- [ ] No open Sev-2 defects (or explicit approved waiver)

## 3. Performance and Reliability Gates

- [ ] Semantic search P95 <= 500 ms (100k asset benchmark)
- [ ] Upload accept+enqueue P95 <= 800 ms (<= 25 MB images)
- [ ] Queue retry and failure behavior validated
- [ ] 24-hour soak run completed with acceptable error rate

## 4. Security and Auth Gates

- [ ] Auth enforced on all protected endpoints
- [ ] Password storage validated (Argon2id)
- [ ] JWT secret and TTL settings verified
- [ ] Upload MIME/size constraints verified
- [ ] TLS ingress configuration verified

## 5. Data Integrity Gates

- [ ] Deduplication behavior validated with duplicate fixtures
- [ ] EXIF persistence validated
- [ ] Semantic and facial query SQL functions validated
- [ ] Backup/restore smoke test for Postgres data completed

## 6. Observability Gates

- [ ] Structured logs include required fields
- [ ] Metrics endpoints available and scraped
- [ ] Alert rules configured and tested
- [ ] Dashboard includes API latency, queue depth, job failures, search latency

## 7. Operational Readiness

- [ ] Deployment runbook updated
- [ ] Rollback runbook validated
- [ ] On-call/owner assignment for release window confirmed
- [ ] Post-release validation steps documented

## 8. Go/No-Go Decision

- [ ] Residual risk summary prepared
- [ ] Explicit ship recommendation recorded (`GO` or `NO-GO`)
- [ ] Decision approvers recorded with timestamp

## 9. No-Go Triggers

Any of the following automatically blocks release:
- unresolved Sev-1 defect
- unresolved auth bypass or data-corruption risk
- failed KPI benchmarks without approved waiver
- inability to rollback safely in staging validation
