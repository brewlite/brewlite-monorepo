# VNPay Sandbox UNKNOWN recovery

Branch: `fix/vnpay-sandbox-unknown`, based on main `30a6679`.

## Finding and change

`CommerceService.inquire` previously counted all queries for each payment during
the API process lifetime. After ten attempts, it returned ATTEMPT_LIMIT forever,
even when all attempts failed because of a temporary network outage. Automatic
reconciliation uses this same method, so it could not recover either.

Replace the lifetime cap with the existing five minute cooldown. A payment may
be queried again after that interval, even after ten failed calls. The cooldown
is reserved before the provider call, preventing simultaneous callers from
issuing duplicate queries in one API instance. Expired cooldown entries are
removed to avoid retaining every previously queried payment indefinitely.
The limiter remains per process, not distributed across API replicas.

Only verified provider evidence reaches settlement. Timeouts keep UNKNOWN.
Browser Return still navigates only. Existing expiry, inventory, ownership,
signature and amount checks remain in force. A verified late success still
requires review instead of fulfilling an expired order.

## Validation

- API: 84 unit tests across 13 suites passed.
- API type-aware lint and production build passed.
- Regression tests cover recovery after ten timeouts, concurrent calls, the
  exact cooldown boundary and ownership rejection.
- Database integration and real merchant transactions were not run.

## Remaining investigation on the deployment

The historical report in `deploy/VNPAY-DIAGNOSTICS.md` records EC2-to-VNPay TCP
timeouts, no confirmed provider IPN delivery, and disabled automatic VNPay
reconciliation. Those observations are historical, not a fresh deployment test.
This source change does not repair routing/firewall/provider connectivity or
register the merchant IPN URL.

Use the existing read-only diagnostic CLI with the affected payment ID on the
deployment. Confirm Sandbox connectivity and merchant registration for
`/api/payments/vnpay/ipn`; inspect redacted API/Caddy diagnostics. Reconcile via
the authenticated endpoint once connectivity works. Do not create a second
payment to resolve an uncertain first payment. Payments with verified success
after order/reservation expiry remain subject to the existing review policy.

No AWS deployment, merchant configuration or production data was changed.
