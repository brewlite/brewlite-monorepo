# VNPay local validation and reconciliation proposal

Date: 2026-11-09 (Asia/Saigon). Branch: `fix/vnpay-expiry-reconciliation`.

## Source comparison

Fetched `origin/main`: `2378697c6203858fd12f27e4d772cfeb7c7a3b28`.
Local baseline `e0eca3c` already contains this commit and is one commit ahead.
Created the new branch from that local baseline, retaining existing uncommitted
work; no pull/reset, main merge, push or deployment was performed.

Read-only inspection of `/app/dist/commerce/commerce.service.js` in the running
AWS API image confirmed that `settleVerified` checks **both** `order.expiresAt`
and `reservation.expiresAt` against processing time, as well as order status,
HELD reservation, expected amount and reused provider transaction number.
GitHub main lacked these expiry guards. Local uncommitted code had both guards
but used signed `vnp_PayDate` as the assessment time when available. That could
fulfill an order after its deadline. Local now checks processing time, matching
the AWS policy. Signed pay time remains evidence and may populate `paidAt` only
when settlement is accepted. It never bypasses either expiry check.

## Existing implementation retained

- Real callback route: `GET /api/payments/vnpay/ipn`, without JWT/Origin guards;
  merchant, HMAC, reference and amount are validated server-side.
- Browser Return navigates only; it cannot settle a payment.
- Payment uses `SUCCESS`; the fulfilled order uses `PAID`.
- An expired SUCCESS creates `PaymentEvent.processingStatus=REQUIRES_REVIEW`,
  retains Payment `UNKNOWN` with `failureReason=RECONCILIATION_REQUIRED`, and
  does not change order, reservation or stock.
- Serializable transaction and retry handle concurrent confirmations. Unique
  provider event IDs and terminal-state checks prevent repeated consumption.
- QueryDr verifies its own response signature, merchant, reference, amount and
  transaction type before settlement. Network errors remain uncertainty.

## Controlled test environment

Dedicated container: `brewlite-vnpay-test-20261109`, PostgreSQL 16, bound to
`127.0.0.1:55439`, no application volume attached. All rows are synthetic.
Test databases are retained for inspection. No production environment or
production credentials were used to sign test requests. No callbacks were sent
to AWS, and automatic VNPay reconciliation stays disabled.

IPN integration tests use random test-only secrets, merchant `STG2TEST`, an
independent HMAC signer and an in-process Nest HTTP server. Global fetch is
blocked unless a test installs an explicit QueryDr fixture.

Coverage includes valid pre-expiry settlement; independent order/reservation
expiry; signed pre-expiry PayDate arriving after expiry; tampered signature,
amount, merchant and unknown reference; sequential/concurrent duplicates;
QueryDr/IPN races; signed QueryDr success/failure, invalid signature/amount,
timeout/network failure; expired QueryDr SUCCESS; authorization and retry limits.

Atomicity tests inject failure after a real inventory mutation and separately
use a test-only PostgreSQL trigger to reject the final Payment update after
event, stock, notification, reservation, order and history writes. Snapshots must
remain identical after rollback; a subsequent callback must succeed once.

To repeat on this test container (PowerShell, from `apps/api`):

```powershell
$env:DATABASE_URL='postgresql://vnpay_test:local_fake_test_only@127.0.0.1:55439/brewlite_test_control?schema=public'
npm.cmd test -- --runInBand
npm.cmd run test:e2e
npm.cmd run test:p3
npm.cmd run test:stage2
npm.cmd run lint
npm.cmd run build
```

`test:e2e` runs auth/other enabled suites and the dedicated P2 inventory suite;
P3 and Stage2 require their separate runners. Optional browser E2E requires
separate frontend/browser setup and is reported as skipped when not enabled.

## Proposed Admin reconciliation screen (design only)

Route: `/admin/payments/reconciliation`. Restrict access to authorized Admin
roles. List payment/order IDs, amount, merchant, provider transaction reference,
verified provider outcome, source (IPN/QueryDr), received/pay/deadline times,
order/reservation state and the reason review is required. Exclude HMAC secrets,
signatures, bank account data and raw provider payloads.

Separate two kinds of state:

1. **Payment verification:** unverified / provider success / provider failure /
   uncertain. Only validated server-to-server evidence changes this state.
2. **Business decision:** needs review / fulfill requested / refund requested /
   resolved. Record actor, reason, timestamp and immutable evidence reference.

The initial screen can offer a rate-limited provider query and an audit trail.
It must not offer an unrestricted “mark PAID” or “mark refunded” toggle.
Completing an expired order requires a separate explicit decision with customer
consent and fresh transactional stock/reservation validation; it must never
reuse a released or expired hold merely because payment verification succeeded.

Refund request and refund confirmation are separate. An Admin may request a
refund with an idempotency key and reason. Keep it pending/uncertain until a
server-side VNPay refund inquiry/response confirms the exact original provider
transaction, amount, merchant and refund identity with a valid signature. An
HTTP 200 or accepted refund request alone does not prove refund completion.
Timeouts must reconcile the same request rather than submit a new refund.
Require unique provider refund identifiers and transactional audit writes.

This change intentionally adds no money-moving/refund endpoint or manual state
override. The proposal needs its own reviewed implementation and mock-based
refund tests before exposure to staff.

## Validation results

| Check | Result |
| --- | --- |
| API unit tests | 71 passed, 9 suites |
| Auth/HTTP integration | 22 passed; unrelated suites disabled in this runner |
| P2 inventory integration | 9 passed |
| P3 cart integration | 11 passed; 1 optional browser test skipped |
| Stage2 checkout/VNPay integration | 25 passed; 1 optional browser test skipped |
| API type-aware lint | Passed |
| API production build | Passed |
| API full TypeScript check including tests | Passed |
| Web unit/component tests | 129 passed, 31 files |
| Web lint | Passed |
| Web production build | Passed after allowing Google Fonts network access |
| Git whitespace check | Passed (existing Caddy CRLF normalization warning only) |

The two optional P3/Stage2 browser tests were not run; no browser end-to-end
claim is made. Production network reachability and VNPay delivery/retry behavior
are not proven by these mock tests. Prisma reports an existing deprecated
`package.json#prisma` configuration warning, with no test/build failure.

Only the commerce expiry policy, QueryDr outcome type, Stage2 integration tests
and this report were edited in this continuation. Existing modified Docker,
frontend, logging and diagnostic files were retained, not overwritten. Work is
left uncommitted on the requested branch for review; no production writes,
deployment, automatic reconciliation enablement, push or main merge occurred.
