# BrewLite — Requirements Traceability Matrix

Version 1.1 P0 · 2026-11-07. Target baseline theo quyết định người yêu cầu, chưa có PR/sign-off nhóm; CR-SEC-01 pending. Không chạy test hoặc ghi database trong P0.

Phân loại: **CODE** = đã thấy source, chưa tự kết luận toàn bộ AC đạt; **DB/SEED** = schema/dữ liệu mẫu; **TARGET** = cần implement. Kết quả test lượt trước được ghi trong [architecture index](architecture/README.md), không phải chứng nhận Gmail/refresh/Order E2E mới. Mọi evidence nghiệm thu phải có test log + SHA/CI link thực.

## Functional requirements

| Requirement | Schema target | API target (prefix /api) | UI | Tests / acceptance | As-Is và PR |
| --- | --- | --- | --- | --- | --- |
| FR-01 | Product/Category/Size inventory | GET /products | Menu | TC-04: hidden, availability, NULL/zero stock | CODE catalog; inventory TARGET P3 |
| FR-02 | Product/Size/Topping | GET /products/:id | Detail | TC-04: hidden 404, options thật | CODE; hidden behavior cần sửa P3 |
| FR-03 | Size/CartItemTopping | catalog + cart validation | Size/topping/qty | TC-05: sai options không bỏ ngầm, qty1..20 | CODE preview; server options gap P3/P4 |
| FR-04 | Product/Category/Size/Topping | /admin/products, /admin/sizes | Admin catalog/inventory | TC-18: RBAC, lịch sử không đổi | TARGET P8 |
| FR-05 | CartItem size/key + CartItemTopping | POST /cart/items, /cart/merge | Cart | TC-05: khác size/note tách dòng, key chuẩn | CODE local; DB chưa đủ P3 |
| FR-06 | Cart.version, cart configuration | PATCH/DELETE /cart/items/:id | Cart/edit/confirm delete | TC-03/05: merge fail giữ local, version conflict | CODE local; sync TARGET P3 |
| FR-07 | Pricing/Promotion/User points | POST /cart/calculate | Quote sau Auth | TC-05: reprice, money string, quote không reserve | CODE nhưng policy/typing chưa đủ P4 |
| FR-08 | User/EmailVerification | register/verify-email/resend-otp | Email + OTP | TC-01: Gmail thật, OTP5m/max5 | CODE OTP10m; email mới theo P1 |
| FR-09 | User/AuthSession | login/logout/me | Account | TC-02: cookies, disabled/unverified, revoke | CODE access; refresh TARGET P1 |
| FR-10 | User roles/session/ownership | guards mọi API protected | Role views | SEC-01/02: CUSTOMER/STAFF/ADMIN, IDOR | CODE guards; target RBAC còn thiếu P1/P8 |
| FR-11 | Auth + cart + Order | me/refresh và POST /orders | Xác nhận mua→Auth→coupon | TC-03: giữ giỏ, chặn anonymous tạo order | CODE PurchaseFlow; orders TARGET P5 |
| FR-12 | Promotion + OrderReservation | /cart/calculate, /orders | Coupon | TC-06/INT-07: cap50%, quota held, rollback | CODE validator một phần; P4/P5 |
| FR-13 | User.reservedPoints, reservation/ledger | quote/orders/payments | Dùng điểm | TC-07/INT-06:100đ, cap20%, balance/held | CODE1000đ lệch; P4/P5/P6 |
| FR-14 | Decimal/snapshots | quote/orders | Total | TC-05/06/07:100000-10000-10000=80000 | CODE Number hiện tại; TARGET P4 |
| FR-15 | Size.onHand/reserved | quote/orders | Availability/hết hàng | TC-08/INT-05: aggregate same Size, NULL block | Product stock CODE; SKU TARGET P3/P5 |
| FR-16 | Order/OrderItem/OrderReservation | POST /orders | Pending order | TC-09/INT-05: atomic reserve, expires10m | DB/SEED; TARGET P5 |
| FR-17 | Payment attempts/Event | POST /orders/:id/payments | Mock wallet/card | TC-11: không PAN/CVV/tiền thật | DB/SEED; TARGET P6 |
| FR-18 | PaymentEvent/reservation/ledger | internal verified callback | Payment result | TC-10/11: consume một lần, amount check | DB/SEED; TARGET P6 |
| FR-19 | Payment attempt/Order | retry/cancel | Retry/cancel | TC-12: max3, key cũ/mới đúng | TARGET P6 |
| FR-20 | IdempotencyRecord/PaymentEvent | create/order/payment/status | Retry an toàn | INT-08/09: same/different payload, event duplicate | TARGET P5/P6/P7 |
| FR-21 | Order snapshots/history | GET /orders/:id | Order detail | TC-13: ownership/status thật | UI placeholder; TARGET P7 |
| FR-22 | Order userId index | GET /orders | History | TC-13: phân trang, chỉ own orders | UI placeholder; TARGET P7 |
| FR-23 | Order.version/StatusHistory | staff orders + PATCH status | STAFF queue | TC-16: sequential, actor/time, ADMIN cannot write | TARGET P7 |
| FR-24 | Notification.order/eventKey | notifications/status | In-app result | TC-13/16: no false SUCCESS, event dedupe | DB/SEED; TARGET P7 |
| FR-25 | Promotion reservedCount | /admin/promotions | ADMIN promotions | TC-18/INT-07:quota không thấp hơn held+used | DB/SEED; TARGET P8 |
| FR-26 | User roles/isActive | /admin/users | ADMIN users/bootstrap | TC-18: whitelist, last-admin, no public elevate | CODE list only; TARGET P1/P8 |
| FR-27 | — | — | Không delivery | Out of scope | Won't, không test Passed giả |
| FR-28 | Payment mock only | Không live gateway | Không card thật | Không PAN/CVV, không tiền thật | Won't live payment |
| FR-29 | — | — | Analytics nâng cao | Chỉ nếu scope sau được duyệt | Could, không chặn MVP |
| FR-30 | User.passwordHash | register (không set-password sau OTP) | Password input | TC-01/CR-SEC-01: Unicode vs72byte, no truncate | CODE bcrypt; CR acceptance pending P1 |
| FR-31 | AuthSession family/hash | POST /auth/refresh | Axios single-flight | SEC-02: rotation/reuse/7d/logout expired access | TARGET P1 |
| FR-32 | Payment UNKNOWN/reservation expiry | inquiry/worker/cancel | Unknown result | INT-10: không retry/cancel mù, late event | TARGET P6 |
| FR-33 | LoyaltyTransaction.orderId unique | STAFF completed service | Points/history | TC-17: floor(payable/10000), exactly once | DB/SEED; TARGET P7 |
| FR-34 | OTP/session rate controls | auth routes | OTP/retry errors | SEC-03:5m,max5,cooldown60s,3/15m,email+IP | CODE limits khác target; P1 |
| FR-35 | Product/Category | GET /products | Search/category | Tìm có/không dấu, no-result/reset | CODE, tests hiện có; hồi quy P3/P9 |
| FR-36 | — | — | Push/multi-store | Ngoài MVP | Could, không tự triển khai |

## Non-functional requirements

| Requirement | Quality/test domain | Test case | Evidence |
|---|---|---|---|
| NFR-01 | Performance / Must | PERF-01 | Planned; CI/report: — |
| NFR-02 | Performance / Must | PERF-02 | Planned; CI/report: — |
| NFR-03 | Security / Must | SEC-01 | Planned; CI/report: — |
| NFR-04 | Security / Must | SEC-02/03 | Planned; CI/report: — |
| NFR-05 | Reliability/integrity / Must | INT-05…10 | Planned; CI/report: — |
| NFR-06 | Usability / Must | UX-01 | Planned; CI/report: — |
| NFR-07 | Accessibility / Should | UX-02 | Planned; CI/report: — |
| NFR-08 | Portability/deployability / Must | DEP-01 | Planned; CI/report: — |
| NFR-09 | Deployability/security / Must | DEP-02 | Planned; CI/report: — |
| NFR-10 | Testability / Must | QA-01 | Planned; CI/report: — |
| NFR-11 | CI/CD / Must | QA-02 | Planned; CI/report: — |
| NFR-12 | Maintainability / Must | QA-03 | Planned; CI/report: — |
| NFR-13 | Recoverability / Must | INT-10 | Planned; CI/report: — |
| NFR-14 | Observability / Must | OPS-01 | Planned; CI/report: — |
| NFR-15 | Availability demo / Should | OPS-02 | Planned; CI/report: — |
| NFR-16 | Auditability / Should | OPS-03 | Planned; CI/report: — |
| NFR-17 | Data quality / Must | DATA-01 | Planned; CI/report: — |
| NFR-18 | Responsive UX / Must | UX-03 | Planned; CI/report: — |

## Review gate và cách ghi bằng chứng

1. Khi thực hiện: điền GitHub issue/PR, file controller/service thực tế, test filename, commit SHA, CI URL và kết quả (Pass/Fail/Blocked) cho từng dòng.
2. Khi thay SP-xx: impact review đến use-case, activity, sequence, class và test. Không được xóa FR ID cũ để che dấu thay đổi; deprecate và ghi changelog.
3. `Planned` **không có nghĩa** test đã chạy; hình mẫu UML **không có nghĩa** ảnh Visual Paradigm người dùng cung cấp đã sửa.
4. Với `Should/Could/Won’t`, nếu bỏ qua thì ghi rõ quyết định release; không đánh dấu test thất bại nếu ngoài phạm vi được chấp thuận.

## Ma trận ngoại lệ UC Task 1.3

| Case | Yêu cầu | Test | Expected |
|---|---|---|---|
| E1/A1 chưa login | FR-08/09/10/11/30 | TC-01/03 | Auth rồi tiếp tục giỏ |
| E2/A2 coupon sai | FR-12/14 | TC-06 | Nhập lại/bỏ, không mất quota |
| E3/A3 điểm sai | FR-13/14 | TC-07 | Nhập lại/bỏ, không trừ điểm |
| E4/A4 hết hàng | FR-15/16 | TC-08/INT-05 | 409, không tạo payable order |
| E5/A5 payment failed | FR-17/19/20/32 | TC-11/12/INT-10 | Retry hoặc cancel/release an toàn |
| Timeout/UNKNOWN bổ sung | FR-20/32 | INT-10 | Reconcile, không kết luận sai/nhân đôi |

## Cập nhật triển khai backend payment/orders — 2026-11-08

Bảng baseline phía trên còn các trạng thái Planned cũ. Phần cập nhật này ghi bằng chứng
cho Task 5.1 dấu chấm 5–6, không tự đánh dấu hoàn thành toàn bộ FR/NFR mở rộng.

| Phạm vi | Code/evidence mới | Kết luận |
|---|---|---|
| FR-17, phần mock wallet/card | apps/api/src/payments/payments.controller.ts; payments.service.ts | Có HTTP endpoint, DTO, JWT; chưa có UI/UNKNOWN |
| FR-18, xác nhận PAID | payment service + OrderStatusEvent migration | Atomic payment/order/audit/notification; chưa consume reservation/coupon/points theo SRS |
| FR-19/20, retry/idempotency payment | payment service + test/payment-orders-http.e2e-spec.ts | Pass same-key/concurrency/fail/retry; không bao gồm cancel/TTL hoặc idempotency tạo đơn |
| FR-21/22 | apps/api/src/orders/orders.controller.ts; orders.service.ts | Có API chi tiết/lịch sử theo owner, phân trang, snapshot và timeline |
| FR-23 | staff-orders.controller.ts; orders.service.ts | Có API STAFF/MANAGER, chuyển tuần tự, actor audit, chống ghi lặp |
| FR-10, phạm vi payment/orders | apps/api/src/access/access.guard.ts | JWT/access claims + DB role + ownership; chưa đại diện Auth/logout/revocation toàn hệ thống |
| FR-24, phần dữ liệu | notification trong transaction và GET order detail | Có dữ liệu thông báo/trạng thái; frontend/push chưa triển khai |
| Task 5.2, test backend phần phụ trách | test/payments-db.e2e-spec.ts + test/payment-orders-http.e2e-spec.ts | 21/21 integration local đạt; không phải E2E menu đến xác nhận |
| CI của phần phụ trách | .github/workflows/payment-orders.yml | Có cấu hình PostgreSQL + quality gates; chưa chạy trên GitHub |

Toàn backend: 18/18 unit tests, lint và npm run build đạt local.
Hợp đồng bàn giao và các giới hạn: [payment-orders-api.md](payment-orders-api.md).

## P0 review gates và tài liệu test legacy

[API contract](architecture/api-contract.md), [DB](architecture/database-baseline.md), [RBAC](architecture/rbac-matrix.md), [Auth](architecture/auth-session-spec.md), [state machine](architecture/order-payment-state-machine.md), [PR plan](architecture/implementation-plan.md) là nguồn chi tiết cho từng dòng.

`tests/acceptance-test-cases.md` vẫn là test design bản cũ (phone/OWNER/set-password); P0 không sửa file ngoài docs. P1/P9 phải cập nhật test scenarios cho email/bcrypt/refresh/STAFF-only và ghi evidence thật. FR/NFR IDs giữ nguyên; không xóa tests cũ để che thay đổi. UML export/nguồn thiếu ghi trong [checklist](architecture/uml-update-checklist.md).

Pending: CR-SEC-01 (Backend/QA/Product), mapping ADMIN, phân bổ Size stock, dữ liệu CartItem legacy. Không có PR/SHA/CI link nào được tự gán vào các gates này.

## Kết quả ghép main vào nhánh payment/orders — 2026-11-08

Hợp đồng runtime hiện tại nằm ở đầu [payment-orders-api.md](payment-orders-api.md).
Phần evidence legacy 18 unit/21 integration phía trên là kết quả trước khi ghép,
không thay thế kết quả kiểm tra app chung. CommerceModule là nguồn xử lý chính;
POST /payments là adapter dùng auth/session, reservation, idempotency và settlement
của main. GET staff order detail được bổ sung với quyền STAFF/ADMIN.
Các module payment/orders cũ vẫn được kiểm tra riêng, không đăng ký trùng route.
Kiểm thử hồi quy app chung: test/commerce.e2e-spec.ts kiểm tra cookie/origin/role,
DTO, owner, retry liên đường dẫn, tồn kho chỉ consume một lần và staff detail.

Kiểm tra local sau ghép: build và lint đạt; 64/64 unit tests; 21/21 integration
module legacy; 23/23 HTTP integration trên AppModule chung (health/auth/catalog/commerce).
Đã áp dụng đủ 5 migrations trên schema test mới và cập nhật DB test cũ thành công.
GitHub CI và frontend/browser E2E của lần ghép này chưa chạy; không đánh dấu đã đạt.
