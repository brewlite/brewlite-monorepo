# Delivery readiness — 2026-11-09

This is an evidence ledger and demo agenda, NOT a fabricated Sprint Review, release or customer sign-off.

## Completed locally in this step

- Editable/exported activity, sequence, domain class and EC2 deployment UML: docs/diagrams/README.md.
- Reusable CI quality gates include P2/P3/Stage2 HTTP suites and deploy safety tests.
- Prepared CD: SHA-tagged GHCR images, main ancestry check, production environment, verified SSH, backup, migration gate, compatible image rollback and public HTTPS smoke.
- Linux deploy/smoke tests: 6 passed (4 Docker orchestration stubs + 2 actual local HTTP smoke tests; no real AWS deploy).
- Backend lint and build: passed. Stage2 HTTP: 39 passed, 1 optional browser test skipped in this run.
- New sample-menu performance test: actual Nest HTTP and PostgreSQL fixtures in isolated brewlite_stage2_test_1794189987416; 5 warmups, 30 measured sequential requests; p95 14.85ms, max 15.23ms, threshold 500ms. This is a local baseline, not an AWS load/SLA test.
- Workflow YAML parsed, Bash/Node syntax checked, and actionlint 1.7.7 passed on both workflows.

No operating database changes, inventory changes, AWS rollout, secret changes, commit, push, tag or release in this step. Earlier authorized local inventory remains a separate update.

## Not yet completed

1. Paid mock cancellation/refund implemented and tested in isolated PostgreSQL; requires reviewed migration before operating rollout. External VNPay refund remains unsupported.
2. production Environment reviewers/secrets/host GHCR pull access: repository administrator setup needed (deploy/CD-SETUP.md).
3. Actual CI/CD and registry evidence: requires reviewed commit/PR/main/release operations and deployment authorization; no links invented.
4. Backup restore rehearsal and performance on AWS: not executed; no operating data replaced.
5. Sprint Review/Retrospective: actual meeting and team observations required. Do not invent dates, participants, burndown or customer feedback.
6. Demo recording and release notes for a real version/tag: pending release.

## Demo agenda ready for the team

1. Show HTTPS frontend and /api/health, then menu search/category and product options.
2. Add/edit cart; prove size inventory is checked server-side.
3. Register/OTP/login with an authorized real account; never expose cookies or secrets in the recording.
4. Apply coupon/points, create PENDING order, choose mock wallet/card, show backend-confirmed PAID, order code and history.
5. In the isolated test environment, demonstrate FAILED/retry, UNKNOWN blocking retry, idempotency and two customers competing for final stock.
6. STAFF: PAID -> PREPARING -> READY -> COMPLETED; ADMIN: inspect inventory/catalog and roles.
7. Show the real CI/CD run, image SHA, backup receipt and smoke output once available.
8. Record actual feedback and agreed backlog; only then write Sprint Review/Retrospective conclusions.

## Final acceptance evidence to collect

Repository/commit and reviewed PR; release tag/notes; UML sources/exports; requirements trace links; test logs; real CI success and an intentional failing-quality-gate run on a disposable PR; CD/environment approval; production URLs; restore rehearsal; demo video; actual Sprint Review/Retrospective. Keep credentials, customer records and database dumps private.


## Mock refund completion

Xem [báo cáo kiểm thử](../architecture/mock-refund-report.md): PAID -> CANCELLED cho mock đã triển khai, có 49 HTTP/browser tests passed. Migration chỉ ở test; rollout vận hành, external refund và minh chứng CD vẫn tách riêng.
