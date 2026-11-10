# Assignment 2: simulated wallet/card payment

Validated locally on 2026-11-09, branch `fix/vnpay-expiry-reconciliation`.

The original Assignment2-BrewLite (1).pdf specifies a simulated payment service
in section 5.1 (PDF page 5) and simulated wallet/card payment in section 7.1
(PDF page 6). The default demo flow now follows that scope.

## Behavior

Payment retries retain their idempotency key and method in sessionStorage until
a definitive response arrives, including across reloads. A confirmed new attempt
gets a new key. The database migration already contains the partial unique index
`payments_single_success_per_order` (`WHERE status = 'SUCCESS'`). Initiating,
settling and releasing an order explicitly lock its row with `FOR UPDATE` inside
the existing serializable transaction/retry boundary.

The expiry job checks either the order deadline or reservation deadline and
returns held stock, coupon quota and points in one transaction. It does not
cancel an order with unresolved PENDING/UNKNOWN payments. The UI labels a passed
deadline as “Hết hạn”, hides payment actions, and lists each attempt's timestamp,
method and outcome under “Các lần thanh toán”.

1. Customer confirms a server-priced order. It remains PENDING.
2. The order detail offers **Ví mô phỏng** and **Thẻ mô phỏng**. No card data,
   CVV or real money is collected. The unused VNPay-only method selector was
   removed from the order confirmation dialog.
3. Existing backend mock settlement decides the outcome. A client sends only
   the method and an idempotency key, never an authoritative SUCCESS result.
4. SUCCESS atomically changes Payment to SUCCESS, Order to PAID, Reservation
   to CONSUMED and consumes stock/coupon/points once.
5. FAILED changes Order to PAYMENT_FAILED and keeps its cart/hold for retry within the deadline.
   UNKNOWN prevents another attempt and does not claim PAID. Existing payment
   polling can obtain the later backend-confirmed outcome.
6. Both mock and existing VNPay payments link to the generic result page.
   The VNPay reconciliation control appears only for a VNPay payment.

## Configuration

### Viewing failure and retry locally

Mock outcomes are deterministic, not random. With `MOCK_PAYMENT_OUTCOME=SUCCESS`
every valid mock attempt succeeds. To demo failure, set
`MOCK_PAYMENT_OUTCOME=FAILED` in `apps/api/.env` and restart the local API. Create
a new order and choose wallet/card: the UI opens the backend payment result,
which shows FAILED. A transport/API error is not a confirmed payment failure.

The retry link returns to the order detail for a fresh attempt. The order must
still be PENDING or PAYMENT_FAILED, both deadlines unexpired, its reservation HELD, fewer
than three payment attempts, and no PENDING/UNKNOWN attempt. The new attempt
uses a new idempotency key. To demo recovery, change the outcome back to SUCCESS
and restart the API before retrying within the original 10-minute window.
Old FAILED attempts remain FAILED. An expired order requires a new order, and
UNKNOWN must be resolved before another attempt; never mark it failed manually.

The shared site frame renders the header and footer on every page. A flex
layout fills the viewport on short pages and keeps the footer in document flow.

- API: `ENABLE_MOCK_PAYMENTS=true`, `MOCK_PAYMENT_OUTCOME=SUCCESS`. These two
  non-secret flags were set in the local API .env, retaining all other values.
  Restart an already running API to load them.
- Root/API/production-demo examples now document the same settings. Production
  compose reads these flags from its environment, with mock/SUCCESS defaults.
  An existing explicit `ENABLE_MOCK_PAYMENTS=false` still overrides that default;
  review it before any later deployment.
- VNPay remains available as an optional extension. Its checkout button is
  hidden unless `NEXT_PUBLIC_ENABLE_VNPAY_SANDBOX=true` at web build time. The
  web Dockerfile exposes the corresponding build argument, defaulting to false.
- No changes to automatic VNPay reconciliation, production credentials, AWS
  containers or existing UNKNOWN VNPay transactions were made.

## Verification

All HTTP integration data belongs to a fresh dedicated PostgreSQL test database
inside the separate localhost-only test container, with synthetic credentials.

| Check | Result |
| --- | --- |
| API unit tests | 71 passed |
| Checkout HTTP integration and browser E2E | 32 passed, none skipped |
| Web unit/component tests | 131 passed |
| API and web lint | Passed |
| API and web production builds | Passed |
| Browser script syntax and git whitespace | Passed |

The six new HTTP cases cover WALLET/CARD with SUCCESS, FAILED and UNKNOWN,
including same-key replay, failed retry, eventual UNKNOWN resolution and no
outbound provider call. Existing VNPay signature/expiry/race/rollback cases
continue passing.

Headless browser E2E used the production-built web app and a real isolated Nest
API/PostgreSQL backend. It traversed product, login, cart, confirmation, mock
wallet payment, result and order history; 34 real backend requests, no gateway
requests and zero runtime exceptions. Final database assertions verify PAID,
SUCCESS, CONSUMED and exactly one stock consumption. Desktop/mobile screenshots
were generated; the mobile result was visually inspected.

The first API build hit a Windows Prisma DLL lock while integration tests were
using that DLL. The sequential retry after test completion passed. No source
workaround was needed.

To repeat after starting the web app on port 3100, run from apps/api:

```powershell
$env:DATABASE_URL='postgresql://vnpay_test:local_fake_test_only@127.0.0.1:55439/brewlite_test_control?schema=public'
$env:STAGE2_BROWSER='1'
$env:FRONTEND_E2E_URL='http://localhost:3100'
$env:BREWLITE_EDGE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm.cmd run test:stage2
```

Browser E2E blocks VNPay requests and redirects API transport to the dedicated
test backend. It does not use or update the ordinary local application database.
Work remains local and uncommitted; no deployment, push or main merge occurred.


## Assignment alignment update (2026-11-09)

Supersedes the earlier cart-clearing/loyalty policy: cart remains after order creation and FAILED. SUCCESS clears only the unchanged checkout cart (version/CAS); newer cart edits remain. EARN is written atomically at PAID once per order, never again at COMPLETED. Retry transitions PAYMENT_FAILED to PENDING and retains all payment attempts/history. UNKNOWN remains unresolved. The new migration renames the existing PostgreSQL enum value in place, adds PAYMENT_FAILED and an optional checkout cart snapshot; no reset, seed or historical payment rewriting. Apply the migration together with the new API/web release, not while the old API is serving requests. No backfill of loyalty points or guessed failure states is performed.


## Mock refund

PAID orders can now be cancelled before PREPARING with an expectedVersion and idempotency key. Payment remains SUCCESS; a unique Refund(MOCK,SUCCESS) records the full simulated return. Stock/coupon/redeemed points and earned-point reversal commit together with CANCELLED. No real funds move. External VNPay refunds and partial refunds are not implemented. The new mock-paid-cancellation migration must be reviewed/applied before serving these sources against an operating database; it was only applied to test databases in this work.
