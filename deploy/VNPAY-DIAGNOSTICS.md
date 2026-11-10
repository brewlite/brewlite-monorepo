# VNPay IPN / QueryDr diagnostics

## EC2 inspection, 2026-11-09 (Asia/Saigon)

### Follow-up deployment

- API and web images `vnpay-debug-20261109` were built locally for linux/amd64,
  transferred with SHA-256 verification, tagged `prod`, and deployed with
  `up -d --no-deps api web`. PostgreSQL, environment files and volumes were not
  replaced; no migration was needed.
- Both order and reservation expiry are now checked before accepting SUCCESS.
  An authenticated late SUCCESS is recorded once as REQUIRES_REVIEW, keeps the
  payment UNKNOWN / RECONCILIATION_REQUIRED, and does not consume held inventory
  or mark the order PAID. Neither a provider failure nor a network error is
  treated as payment success.
- Tests: 71 API unit tests, 12 isolated Stage2 integration tests passed; the
  optional browser integration test was skipped. API/web Docker builds passed.
- Public API health and web homepage returned HTTP 200 after deployment.
- The scoped before/after check of the two investigated payments, their orders,
  reservation states, PaymentEvent counts and related size inventories matched.
- One read-only QueryDr from the new AWS container reported TIMEOUT and no
  verified provider outcome; its database snapshot was unchanged. The external
  EC2-to-VNPay connectivity issue remains unresolved.
- Previous app images were retained as `before-vnpay-debug-20261109`.

Rollback app images only, if needed (never reset the database):

```sh
sudo docker tag brewlite-api:before-vnpay-debug-20261109 brewlite-api:prod
sudo docker tag brewlite-web:before-vnpay-debug-20261109 brewlite-web:prod
sudo docker compose --env-file deploy/.env.production -f compose.prod.yml up -d --no-deps api web
```

### Initial findings (before the above app deployment)

- The existing non-legacy 45,000 VND payment is UNKNOWN, its order remains
  PENDING_PAYMENT, and it has zero PaymentEvents. Database inspections were
  performed in read-only transactions; no settlement or new payment was created.
- One QueryDr attempt from the running API container timed out before receiving
  an HTTP response. This is not a returned VNPay merchant/signature error code.
- DNS resolved the Sandbox hostname to IPv4. TCP 443 from both EC2 host and
  API-container TLS timed out; EC2 TCP 443 to Google succeeded. UFW is inactive
  and the host OUTPUT policy is ACCEPT. This narrows the issue to the specific
  EC2-to-VNPay network path; it does not prove which party filters it.
- Automatic reconciliation is disabled on this deployment. It was not enabled
  while the network path remained unavailable; merchant credentials were untouched.
- Caddy access logging was previously absent. Its existing configuration was
  backed up as `deploy/Caddyfile.before-vnpay-logging-20261109`, then the reviewed
  redacted logging configuration was validated and hot-reloaded without replacing
  application containers. An unsigned diagnostic IPN request returned 97 and
  produced an `endpoint=vnpay-ipn` access entry without URI or headers. That probe
  is not evidence that VNPay itself sent an IPN.
- No historic IPN delivery can be inferred from previously unavailable access logs.
  Confirm merchant IPN registration independently with VNPay and investigate
  Sandbox connectivity from EC2 before another QueryDr attempt.

This does not prove a completed Sandbox transaction. Keep the existing Payment ID;
do not pay again and never update SUCCESS/PAID manually.

## Changes

- Nest emits `vnpay.ipn` reply codes and `vnpay.querydr` diagnostic reasons.
- Verified references are correlated by a SHA-256 prefix, not logged verbatim.
- No Hash Secret, signature, request body, raw response or provider message is logged.
- Caddy access logs exclude URIs/query strings and headers. IPN requests carry
  `endpoint=vnpay-ipn`; correlate timestamps with Nest IPN events. There is no
  historical recovery of logs.
- QueryDr preserves HTTP/JSON/network/signature/matching failures separately.
  Provider error codes are marked unverified unless the signature validates.
- A repeated application query is limited to once per 5 minutes per payment per
  running instance; this is not a distributed limiter.
- A documented optional `vnp_Command` is accepted when omitted, provided the
  signature, merchant, reference, amount, transaction type and response ID validate.

## On the existing EC2 deployment

Deploy/rebuild the reviewed API and web changes, and reload the reviewed Caddy
configuration using the project's normal deployment process. Do not overwrite the
production environment, restore a database or change merchant credentials.

From the repository directory on EC2 (replace PAYMENT_UUID with the actual ID):

```sh
# Snapshot only: no VNPay call, no database writes.
docker compose --env-file deploy/.env.production -f compose.prod.yml exec -T api node scripts/diagnose-vnpay.cjs PAYMENT_UUID

# One Sandbox QueryDr call: still no settlement or database writes.
# Do not repeat within 5 minutes; the diagnostic CLI itself has no cross-run limiter.
docker compose --env-file deploy/.env.production -f compose.prod.yml exec -T api node scripts/diagnose-vnpay.cjs PAYMENT_UUID --query

# Inspect new application/provider diagnostic events, without dumping environments.
docker compose --env-file deploy/.env.production -f compose.prod.yml logs --since 15m --tail 200 api caddy
```

Only reconcile via the existing authenticated payment reconciliation endpoint after
inspection. It retains ownership validation and settles only verified results.
The read-only CLI intentionally does not invoke settlement.

No PaymentEvent alone does not prove that no IPN arrived: invalid signatures,
unknown references and mismatched amounts are rejected before settlement/events.

Official reference:
https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html
