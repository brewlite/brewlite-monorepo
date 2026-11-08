# Thanh toán và đơn hàng — Backend Task 5.1 (dấu chấm 5–6)

## Đã triển khai

- POST /api/payments: WALLET/CARD mô phỏng, lấy tiền từ DB, trả payment + xác nhận đơn.
- JWT access guard HS256: sub, exp, tokenUse=access; role lấy từ database.
- Kiểm tra chủ đơn, trạng thái và số tiền; idempotency và retry transaction Serializable.
- Thành công: payment + PAID + audit + notification atomic; thất bại giữ PENDING_PAYMENT.
- GET /api/orders, GET /api/orders/:id: history/filter/pagination và snapshot, timeline.
- GET /api/staff/orders, GET /api/staff/orders/:id: chỉ STAFF/MANAGER, đơn đã thanh toán.
- PATCH /api/staff/orders/:id/status: PAID→PREPARING→READY→COMPLETED.
- Optimistic concurrency bằng expectedStatus; replay không tạo notification/audit trùng.
- Migration additive order_status_events và index phục vụ truy vấn.
- Workflow CI riêng có PostgreSQL và kiểm thử HTTP/JWT thực.

Hợp đồng API, ví dụ request/response và bàn giao:
[docs/payment-orders-api.md](../../../../docs/payment-orders-api.md).

## Kiểm chứng thực tế — 2026-11-08

- Lint: đạt, không có cảnh báo mới.
- Backend unit tests: 18/18 đạt (bao gồm 5 unit test payment).
- Integration payment/service DB + HTTP/JWT: 21/21 đạt.
- Build đầy đủ `npm run build`: đạt (Prisma generate + Nest build).
- Migration mới đã chạy trên DB test local và DB phát triển local.
- Không chạy/reset/seed DB production.
- Workflow mới chưa push/chạy trên GitHub; kết quả ở trên là local.

Integration bao gồm payment success/fail/retry, idempotency đồng thời, sai chủ đơn,
token sai/hết hạn/refresh, role giả, issuer/audience, pagination, snapshot không đổi,
staff transitions/retry/concurrency, rollback payment và status khi notification lỗi.
Test fixture tạo đơn trực tiếp: chưa phải E2E của toàn website.

## Phụ thuộc tích hợp

- Auth đồng đội: cấp JWT đúng hợp đồng hoặc dùng guard chung tương đương.
- Orders/create đồng đội: tạo đơn PENDING_PAYMENT có owner, snapshot và amount đúng.
- Frontend: nối API; giữ key khi retry mạng; xử lý payment.status và 409.
- Chưa triển khai checkout tạo đơn, Auth/login/register, frontend, production deployment.
- Loyalty/coupon/inventory reservation, expiry/cancel/UNKNOWN reconciliation là phạm vi
  cần nhóm thống nhất thêm; module này không tự nhận là đã đáp ứng toàn bộ SRS mở rộng.

## Chạy kiểm tra

Từ apps/api:
```powershell
npm run lint
npm test -- --runInBand
npm run build
node --env-file=.env.test --experimental-vm-modules node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --runTestsByPath test/payments-db.e2e-spec.ts test/payment-orders-http.e2e-spec.ts
```

Integration chỉ cho phép DB local tên brewlite_payment_test. Không dùng DB thật để test.
Để chạy bản build và nạp .env rõ ràng: `node --env-file=.env dist/main.js`.
Không commit .env/.env.test hoặc JWT thật.
