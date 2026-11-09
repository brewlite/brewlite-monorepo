# Assignment 1/2 alignment — 2026-11-09

## Scope and behavior

- Order creates as PENDING; verified FAILED changes Order to PAYMENT_FAILED with history/version. Retry returns to PENDING, then PAID only on verified SUCCESS.
- UNKNOWN stays unresolved; expiry/signature/amount checks are preserved. No synthetic production callback or manual paid update.
- EARN is committed atomically at PAID once per order. COMPLETED does not award again. Existing unique(orderId,type), order locking, transactions and idempotency remain.
- Keep cart at creation and after FAILED. On SUCCESS clear only snapshot item IDs when cart version still matches; preserve later edits. Header badge reads CartProvider and refreshes after confirmed settlement.
- Add validated, authenticated POST /api/payments {orderId,method} and GET /api/orders/me aliases, preserving existing endpoints and ownership checks.
- Synchronize SRS, product policy, state machine, API notes, acceptance tests and latest traceability evidence. This is not a new approval for historical unrelated decisions.

## Main implementation files

- apps/api/prisma/schema.prisma and migrations/20261109020000_assignment_order_states/migration.sql
- apps/api/prisma/seed.ts: enum reference only; seed NOT executed
- apps/api/src/commerce/commerce.service.ts, commerce.controller.ts, payment.dto.ts
- apps/api/test/commerce.e2e-spec.ts and stage2-checkout.e2e-spec.ts
- apps/web/components/layout/header.tsx and app/globals.css
- apps/web/components/cart/cart-provider.tsx
- apps/web/components/checkout/payment-result.tsx
- apps/web/components/orders/orders-view.tsx, customer-orders.tsx, customer-orders.css, order-history.tsx
- apps/web/components/admin/admin-overview.tsx and order-monitor.tsx
- apps/web/tests/admin-navigation.test.tsx, header-account.test.tsx, logout-navigation.test.tsx, orders-view.test.tsx, payment-result.test.tsx

Existing uncommitted changes were retained; the above lists this task's affected areas, not every dirty file in the repository.

## Verified this run

| Check | Result |
|---|---|
| API lint / TypeScript / production build | Passed |
| API unit | 71 passed |
| Auth/commerce integration | 22 passed; optional phase suites skipped by runner and tested separately below |
| P2 inventory integration | 9 passed |
| P3 cart integration | 11 passed; 1 optional P3 browser test skipped |
| Stage2 HTTP + browser E2E | 39 passed, none skipped |
| Web lint / unit / production build | Passed / 153 passed / Passed |
| Desktop/mobile Checkout -> mock payment -> result -> history | Passed; 44 real test API requests, gateway requests blocked, zero runtime exceptions |
| Whitespace | git diff --check passed |

Browser screenshots cover 1440px desktop and 390px mobile. Mobile payment result visually inspected. Prisma DLL initially locked by a local Nest watcher; the exact local process tree was stopped and generate/build/typecheck then succeeded. No client files deleted to work around the lock.

## Isolated databases

All fixtures/migrations for this run used the dedicated localhost-only PostgreSQL test container on port 55439, not the operating database:

- brewlite_stage2_test_1794188967358 (final HTTP/browser run)
- brewlite_p3_test_1794189020814
- brewlite_p2_test_1794188862740
- brewlite_test_control, isolated schema brewlite_auth_test_1794188832934

Earlier diagnostic test databases are retained. No reset/drop/seed was run. Fixtures are test-only customers, products, sizes, stock, toppings, coupons and signed provider mocks; no production merchant callback was fabricated.

## Deployment boundary

Migration tested only on test databases. Operating local/PostgreSQL and AWS were NOT migrated or deployed. No historical loyalty backfill or retrospective order/payment status correction is performed.

The local API watcher is stopped. Before running the new API against an operating database, review and apply migration together with the corresponding API/web release. The old API expects PENDING_PAYMENT and must not run against the renamed enum. The new API requires the new enum and checkout snapshot column. Coordinate service downtime/backup and migration; do not start incompatible versions. Existing PAID/UNKNOWN payment records remain unchanged by this work.

No env/AGENTS/stash changes, commit, push or merge in this task. The temporary web E2E server was stopped.

## Remaining assignment deliverables

These behavior fixes do not certify the whole assignment. CD pipeline, release/review/retrospective evidence and up-to-date editable/exported UML still need separate completion and review. VNPay external network/IPN merchant issues remain separate from the required working mock payment flow. GitHub CI has not run for these uncommitted changes.


## Local inventory update and re-audit — 2026-11-09

This update supersedes the earlier local migration boundary above; AWS remains unchanged.

User explicitly requested all products visible with stock 30. Verified target from the existing configuration: localhost:5433/brewlite_db, public schema. Applied the already-tested 20261109020000_assignment_order_states migration locally; no reset/seed or historical payment correction.

Within a serializable transaction, enabled all products and sizes, enabled inactive categories if any, and set each Size.onHand to 30 using version/CAS with reserved <= 30. Kept reserved values intact. Result: 25/25 visible products, 50/50 available sizes, total reserved 0. All products already had sizes; no new products/sizes were created. The previously hidden duplicate product is deliberately visible again under the latest all-products instruction.

Before-image backup: D:/BrewLite-P3-temp/inventory-before-30-1794189242830.json (catalog/inventory only; no secrets). Order, Payment, CartItem and User counts unchanged. Product.stockQuantity was NOT used as Size inventory. ProductsService.findAll() directly verified all 25 products and 50 available sizes at 30; Decimal price JSON type remains string. This direct service check is not an HTTP/runtime browser test. Menu currently paginates 12 products per page (25 products = 3 pages).

Re-ran API lint, TypeScript and 71 unit tests: passed. Web lint and 153 tests: passed. Fresh isolated Stage2 database brewlite_stage2_test_1794189287746: 38 HTTP integration tests passed, optional browser test skipped in this repeat run. Previous full run had 39 including real browser E2E; no source changes in this inventory-update turn, so builds were not repeated.

Local database has one unresolved mock payment and no HELD reservations. Kept it unchanged; did not start Commerce reconciliation worker merely to verify inventory. Local API remains stopped; AWS and production VNPay data untouched. No env, AGENTS, stash, commit or push changes.

### Remaining compliance gaps (not certified complete)

- Only CI workflow exists; Assignment 2 CD pipeline/release/deploy smoke-test evidence is incomplete.
- docs/diagrams currently contains ClassDiagram.png and usecase-overview.puml/svg; editable/exported activity, sequence and actual deployment diagrams need completion and consistency review.
- Assignment 1 state-machine illustration includes cancellation after PAID; current policy/code deliberately permits cancellation only before PAID (PENDING/PAYMENT_FAILED), and has no paid-order cancellation/refund flow. This is a remaining difference requiring explicit reconciliation; do not claim every state-machine edge matches.
- API <500ms under sample load and full delivery/Scrum/release evidence were not measured/verified in this turn.
- Required mock wallet/card flow is tested. VNPay network/merchant/IPN verification remains an independent extension issue.
