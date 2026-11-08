## Trạng thái sau khi ghép main — 2026-11-08

**Phần này thay thế hợp đồng runtime cũ bên dưới.** Main hiện đã có CommerceModule,
AuthSession, tồn kho được giữ chỗ, điểm thưởng và OrderStatusHistory. AppModule dùng
các controller của CommerceModule, không đăng ký đồng thời OrdersModule/PaymentsModule
cũ vì chúng trùng route và dùng luồng xác thực khác.

- Đăng nhập qua `/api/auth/login`, gửi cookie phiên (`credentials: 'include'`),
  không dùng Bearer token tự ký của bản cũ. Yêu cầu thay đổi dữ liệu phải có Origin
  thuộc FRONTEND_ORIGIN. Tài khoản cần active, verified và session còn hiệu lực.
- `POST /api/payments` vẫn nhận `{ orderId, method: "WALLET" | "CARD", idempotencyKey }`
  và trả `{ payment, order }` (HTTP 200), nhưng gọi cùng CommerceService với
  `POST /api/orders/:id/payments`. Hai đường dẫn dùng chung idempotency và settlement.
- Chỉ thanh toán đơn tạo bởi luồng mới (`isLegacy=false`), còn hạn và có reservation.
  Không thanh toán trực tiếp đơn seed/legacy để tránh bỏ qua tồn kho và điểm.
- `GET /api/orders` trả mảng theo hợp đồng main (tối đa 100), không phải object phân trang cũ.
  `GET /api/orders/:id` trả chi tiết của chủ đơn, timeline nằm ở `history`.
- `GET /api/staff/orders` và `GET /api/staff/orders/:id`: STAFF/ADMIN.
  `PATCH /api/staff/orders/:id/status`: chỉ STAFF, body
  `{ nextStatus, expectedVersion }`, header `Idempotency-Key`. Quyền MANAGER và
  body `expectedStatus` của bản cũ không áp dụng trên app chung.
- Các cập nhật dùng OrderStatusHistory của main. Bảng OrderStatusEvent/migration cũ
  giữ nguyên để bảo toàn dữ liệu và kiểm thử, không phải timeline runtime mới.
- Bật mock trong môi trường phát triển bằng `ENABLE_MOCK_PAYMENTS=true` và
  `MOCK_PAYMENT_OUTCOME=SUCCESS` hoặc FAILED. VNPay của main được giữ nguyên;
  bài test mock không chứng nhận kết nối VNPay thật.

Kiểm tra từ `apps/api` trên database local riêng `brewlite_payment_test`:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test -- --runInBand
node --env-file=.env.test scripts/run-payment-orders-tests.cjs
```

Runner áp dụng migrations vào DB test, kiểm tra các module legacy riêng biệt, sau đó
kiểm tra **AppModule thật** bằng login/cookie trong schema mới `brewlite_auth_test_payment_*`.
Không reset/seed database sử dụng hằng ngày. Schema test được giữ lại để kiểm tra.
Khi chạy app chung trên máy thành viên, sao chép cấu hình riêng từ `.env.example`,
cài dependencies và chạy `npx prisma migrate deploy` trước khi khởi động.

## Hợp đồng trước khi ghép (tham khảo lịch sử, không dùng để tích hợp frontend)

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
