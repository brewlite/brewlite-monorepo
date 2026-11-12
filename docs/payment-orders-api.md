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

# Backend bàn giao: Thanh toán, xác nhận và trạng thái/lịch sử đơn

Phạm vi: Assignment 2 Task 5.1, dấu chấm 5–6. Chỉ thanh toán mô phỏng, không thu tiền thật.
Các endpoint dùng prefix `/api`. Role quản lý trong schema hiện tại là `MANAGER`, không phải `OWNER`.

## 1. Điều kiện chạy và hợp đồng với đồng đội

1. Dùng Node 24, chạy `npm ci` tại `apps/api`.
2. PostgreSQL đã có schema ban đầu. Triển khai migration mới:
   `npx prisma migrate deploy`, sau đó `npx prisma generate`.
   Migration mới thêm bảng `order_status_events` và index; không xóa dữ liệu cũ.
   Đơn cũ không được tự tạo lịch sử giả.
3. Cấu hình DATABASE_URL riêng và JWT_SECRET ngẫu nhiên tối thiểu 32 byte.
   Không dùng khóa mẫu trong .env.example gốc. Tham khảo `apps/api/.env.payment.example`.
4. Module Auth của đồng đội phải cấp access JWT **HS256** có:
   `sub = User.id`, `exp` chưa hết hạn, `tokenUse = "access"`.
   Nếu cấu hình JWT_ISSUER/JWT_AUDIENCE, token phải khớp cả hai.
   Refresh token không được dùng làm access token.
5. Guard kiểm tra chữ ký, thời hạn, thuật toán, loại token, tài khoản tồn tại;
   role được lấy từ database mỗi request, không tin role/userId từ client.
6. Backend tạo đơn của đồng đội phải tạo Order thuộc user đang đăng nhập,
   status=PENDING_PAYMENT, mã đơn duy nhất, snapshot items và finalTotal chính xác.
   Chính sách giữ/trừ tồn kho, coupon và điểm phải được nhóm thống nhất trong luồng tạo đơn.
   Module này không tự trừ kho/điểm lần nữa.
7. Build bằng `npm run build`, chạy `node --env-file=.env dist/main.js` để nạp cấu hình rõ ràng. Frontend dùng base URL `http://localhost:3001/api`.

Không có endpoint đăng nhập/đăng ký được tạo trong phần này. Không có cơ chế tự cấp JWT public,
không nhận userId giả để thay JWT. Schema hiện chưa có session/revocation hoặc disabled account;
logout/refresh/revocation thuộc module Auth và cần tích hợp khi có.

## 2. API

Mọi request cần `Authorization: Bearer <access-token>`.

| Method | Route | Quyền | Kết quả |
|---|---|---|---|
| POST | /api/payments | Chủ đơn | Payment attempt và chi tiết xác nhận đơn |
| GET | /api/orders | Tài khoản đăng nhập | Lịch sử của chính tài khoản |
| GET | /api/orders/:id | Chủ đơn | Snapshot món, tiền, trạng thái, payment và timeline |
| GET | /api/staff/orders | STAFF/MANAGER | Danh sách đơn đã thanh toán trở đi |
| GET | /api/staff/orders/:id | STAFF/MANAGER | Chi tiết đơn đã thanh toán |
| PATCH | /api/staff/orders/:id/status | STAFF/MANAGER | Đổi trạng thái theo optimistic concurrency |

### Thanh toán

```json
{
  "orderId": "UUID-cua-don",
  "method": "WALLET",
  "idempotencyKey": "UUID-moi-cho-moi-lan-thanh-toan"
}
```

`method` chỉ là WALLET hoặc CARD. DTO bắt buộc UUID thực; chuỗi minh họa trên phải thay.
Không gửi số thẻ, CVV hoặc số tiền. Server đọc amount từ Order.finalTotal.

Response HTTP 200:
```json
{
  "payment": {
    "id": "...",
    "orderId": "...",
    "method": "WALLET",
    "status": "SUCCESS",
    "amount": "45000",
    "transactionRef": "MOCK-...",
    "paidAt": "..."
  },
  "order": {
    "id": "...",
    "orderCode": "...",
    "status": "PAID",
    "finalTotal": "45000",
    "items": [],
    "payments": [],
    "statusEvents": []
  }
}
```
Đây là response rút gọn minh họa; API còn trả các trường snapshot của Order.
Tiền Decimal được JSON hóa thành chuỗi; frontend định dạng để hiển thị, không dùng để quyết định amount.

- PAYMENT_MOCK_RESULT=SUCCESS: ghi payment, PAID, audit và notification trong cùng transaction.
- PAYMENT_MOCK_RESULT=FAILED: payment.status=FAILED, order vẫn PENDING_PAYMENT.
- HTTP 200 không luôn có nghĩa thanh toán thành công: đọc `payment.status`.
- Lỗi mạng: retry **cùng key và payload**, không phát sinh key mới tùy tiện.
- Cùng key khác order/method/user: 409.
- Attempt FAILED muốn thử thanh toán mới: tạo key mới; cùng key trả lại FAILED cũ.
- Đơn đã PAID hoặc đi xa hơn: key cũ vẫn truy hồi payment, key mới bị từ chối.
- Nếu HTTP lỗi sau khi DB đã commit, retry cùng key hoặc GET chi tiết đơn để xác nhận.
- Giao dịch mô phỏng chạy local trong transaction; không thay bằng gọi gateway tiền thật trong vòng retry.

### Lịch sử và hàng đợi

`GET /api/orders?page=1&limit=20&status=PAID`

- page nguyên >=1; limit 1–100; status thuộc OrderStatus, có thể bỏ.
- Lịch sử khách sắp xếp mới nhất trước; hàng đợi nhân viên cũ nhất trước.
- Response: `{ items, page, limit, total, totalPages }`.
- Khách không thể đổi user bằng query. Chi tiết đơn người khác trả 404.
- Staff chỉ xem PAID/PREPARING/READY/COMPLETED; pending/cancelled không xuất hiện.
- Chi tiết trả snapshot OrderItem/Topping đã lưu, không lấy giá hiện tại của catalog.
- Timeline không lộ actorId cho khách; DB vẫn lưu actorId để truy vết nội bộ.
- Frontend có thể refresh/poll GET chi tiết để xem trạng thái mới; chưa có WebSocket/push.

### Cập nhật tiến độ

```json
{ "expectedStatus": "PAID", "status": "PREPARING" }
```

Chỉ chấp nhận:
`PAID → PREPARING → READY → COMPLETED`.

- Gửi trạng thái đã đọc qua expectedStatus; nếu đơn đã thay đổi không tương thích trả 409.
- Gửi lặp cùng bước khi đơn vẫn ở trạng thái đích trả 200, không tạo audit/notification trùng.
- Hai nhân viên cập nhật đồng thời: chỉ một lần ghi có hiệu lực; request còn lại 200 replay hoặc 409.
- Không thể dùng route này tự đánh dấu PAID, hủy đơn, chuyển lùi hoặc nhảy bước.
- Mutation trạng thái, audit và notification cùng transaction.
- Không tự cộng điểm thưởng: loyalty phải được tích hợp riêng theo chính sách nhóm.

## 3. Lỗi

| HTTP | Ý nghĩa |
|---|---|
| 400 | DTO/UUID/phân trang không hợp lệ hoặc đơn không thể thanh toán mới |
| 401 | Thiếu/sai/hết hạn JWT, token không phải access, tài khoản không tồn tại |
| 403 | Không có quyền nhân viên/quản lý |
| 404 | Đơn không tồn tại hoặc không thuộc phạm vi được xem |
| 409 | Idempotency key xung đột hoặc cập nhật trạng thái không hợp lệ/bị cạnh tranh |
| 503 | JWT secret hoặc chế độ payment mock chưa cấu hình hợp lệ |

## 4. Kiểm thử và CI

Unit: `npm test -- --runInBand`.

Integration chỉ dùng DB local riêng **brewlite_payment_test**; suite kiểm tra tên DB và host
trước mọi ghi dữ liệu. Tạo `.env.test` private với DATABASE_URL trỏ DB này, không dùng DB dev/production.
Áp dụng migration vào đúng DB test:
```powershell
node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.test --experimental-vm-modules node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --runTestsByPath test/payments-db.e2e-spec.ts test/payment-orders-http.e2e-spec.ts
```
Nếu DATABASE_URL đã có trong environment, Node ưu tiên environment hơn env-file;
suite sẽ từ chối DB sai. Mỗi test chỉ dọn các user/order fixture do chính nó tạo.
CI `.github/workflows/payment-orders.yml` có PostgreSQL riêng, migration, lint/unit/build/integration.

Test HTTP dùng JWT thật, guard thật và PostgreSQL thật, tạo đơn fixture trực tiếp.
Đây là integration backend, **không phải E2E menu→checkout của toàn website**.

## 5. Bàn giao theo thành viên

- Auth: thống nhất claims nêu trên hoặc thay AccessGuard bằng guard chung có cùng guarantees.
- Tạo đơn: owner, snapshot, amount, trạng thái đầu và chính sách inventory/loyalty/coupon.
- Frontend: nối 6 endpoint, giữ idempotency key khi retry mạng; xử lý 401/403/404/409;
  đọc payment.status, hiển thị mã đơn/timeline và refresh khi cập nhật cạnh tranh.
- DevOps: migration trước khi chạy phiên bản mới, secret private, bật required CI check trên GitHub.
- Nhóm: cập nhật SRS cho role MANAGER/OWNER; quyết định TTL, UNKNOWN/reconciliation và loyalty
  nếu giữ các mục nâng cao đó là Must. Chúng chưa được phần thanh toán tối thiểu này thực hiện.

## 6. Truy vết phạm vi

| Yêu cầu | Code | Kiểm chứng |
|---|---|---|
| Ví/thẻ mô phỏng, xác nhận | payments.controller/service, mock-payment.service | wallet/card, amount, failed/retry, replay/concurrency, rollback |
| Lịch sử và trạng thái của khách | orders.controller/service | ownership, filters, pagination, timeline |
| Xử lý đơn nhân viên | staff-orders.controller, orders.service | role DB, transition, retry/stale/concurrent updates |
| JWT và validation cho phần này | access.guard, DTOs | expiry, signature, token type, issuer/audience, spoofed role, invalid payload |
| Dữ liệu/audit | migration order_status_events | DB integration, rollback, không ghi trùng |

## 7. Kết quả xác minh local ngày 2026-11-08

- Unit: 18/18 đạt.
- Integration: 21/21 đạt (16 HTTP/JWT/PostgreSQL + 5 payment service/PostgreSQL).
- Lint và build đầy đủ Prisma + Nest: đạt.
- Smoke bản build: /api/health=200, /api/orders không token=401, JWT hợp lệ=200.
- Migration additive đã áp dụng vào brewlite_payment_test và brewlite_db local.
- JWT_SECRET mẫu của môi trường local đã được thay bằng khóa ngẫu nhiên trong .env ignored.
- Chưa push, chưa có kết quả workflow GitHub hoặc production.
