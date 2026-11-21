# BrewLite — Requirements Traceability Matrix

Version 1.1 P0 · 2026-11-07. Target baseline theo quyết định người yêu cầu, chưa có PR/sign-off nhóm; CR-SEC-01 pending. Không chạy test hoặc ghi database trong P0.

Phân loại: **CODE** = đã thấy source, chưa tự kết luận toàn bộ AC đạt; **DB/SEED** = schema/dữ liệu mẫu; **TARGET** = cần implement. Kết quả test lượt trước được ghi trong [architecture index](architecture/README.md), không phải chứng nhận Gmail/refresh/Order E2E mới. Mọi evidence nghiệm thu phải có test log + SHA/CI link thực.


## Ma trận truy vết theo Assignment 2 – Task 8.1

Bảng liên kết các yêu cầu trong SRS với use-case,
tạo phẩm thiết kế, mã nguồn/API và kiểm thử.

Lưu ý: Tên file test thể hiện nơi có kịch bản
kiểm thử liên quan; kết quả Pass/Fail phải được
xác nhận bằng log CI hoặc biên bản thực thi.

| Mã yêu cầu | Use-case/User Story | Thiết kế/Sơ đồ | Code/API | Test |
|---|---|---|---|---|
| FR-01 | Khách xem thực đơn | usecase-overview, class-domain | GET /api/products | catalog-page.test.tsx; TC-04 |
| FR-02 | Khách xem chi tiết sản phẩm | usecase-overview, class-domain | GET /api/products/:id | product-detail.test.tsx; TC-04 |
| FR-03 | Khách chọn size, topping, số lượng | activity-checkout, class-domain | Cart validation | p2-inventory.e2e-spec.ts; TC-05 |
| FR-04 | Quản trị danh mục và sản phẩm | class-domain | /api/admin/* | commerce.e2e-spec.ts; TC-18 |
| FR-05 | Khách thêm sản phẩm vào giỏ | activity-checkout, class-domain | POST /api/cart/items | p3-cart.e2e-spec.ts; TC-05 |
| FR-06 | Khách chỉnh sửa hoặc xóa giỏ hàng | activity-checkout | PATCH/DELETE /api/cart/items/:id | p3-cart.e2e-spec.ts; TC-03/05 |
| FR-07 | Khách xem tổng tiền tính từ máy chủ | sequence-checkout | POST /api/cart/calculate | cart-pricing.e2e-spec.ts; TC-05 |
| FR-08 | Khách đăng ký và xác minh OTP | usecase-overview | /api/auth/register, /verify-email | auth.e2e-spec.ts; TC-01 |
| FR-09 | Khách đăng nhập và đăng xuất | usecase-overview | /api/auth/login, /logout | auth.e2e-spec.ts; TC-02 |
| FR-10 | Phân quyền người dùng | class-domain | Auth guards, Roles | auth.e2e-spec.ts; SEC-01 |
| FR-11 | Khách xác nhận đặt món | activity-checkout, sequence-checkout | POST /api/orders | stage2-checkout.e2e-spec.ts; TC-03 |
| FR-12 | Khách áp dụng mã giảm giá | activity-checkout | POST /api/cart/calculate | commerce.e2e-spec.ts; TC-06 |
| FR-13 | Khách sử dụng điểm tích lũy | activity-checkout, class-domain | Cart quote / Orders | stage2-checkout.e2e-spec.ts; TC-07 |
| FR-14 | Hệ thống tính tổng giá trị đơn | sequence-checkout | POST /api/cart/calculate | cart-pricing.e2e-spec.ts; TC-05 |
| FR-15 | Hệ thống kiểm tra tồn kho | class-domain, sequence-checkout | Inventory / Order service | p2-inventory.e2e-spec.ts; TC-08 |
| FR-16 | Khách tạo đơn hàng | activity-checkout, sequence-checkout | POST /api/orders | commerce.e2e-spec.ts; TC-09 |
| FR-17 | Khách thanh toán mô phỏng | sequence-checkout | POST /api/orders/:id/payments | stage2-checkout.e2e-spec.ts; TC-11 |
| FR-18 | Hệ thống xác nhận kết quả thanh toán | sequence-checkout | Payment settlement | commerce.e2e-spec.ts; TC-10 |
| FR-19 | Khách thử lại hoặc hủy thanh toán | activity-checkout, sequence-checkout | Payment retry / Order cancel | stage2-checkout.e2e-spec.ts; TC-12 |
| FR-20 | Chống xử lý trùng yêu cầu | sequence-checkout | Idempotency-Key | commerce.e2e-spec.ts; INT-08/09 |
| FR-21 | Khách xem chi tiết đơn hàng | class-domain | GET /api/orders/:id | orders-view.test.tsx; TC-13 |
| FR-22 | Khách xem lịch sử mua hàng | usecase-overview | GET /api/orders/me | stage2-checkout.e2e-spec.ts; TC-13 |
| FR-23 | Nhân viên xử lý đơn | activity-checkout, class-domain | PATCH /api/staff/orders/:id/status | commerce.e2e-spec.ts; TC-16 |
| FR-24 | Khách nhận thông báo đơn hàng | class-domain | /api/account/notifications | stage2-checkout.e2e-spec.ts; TC-13/16 |
| FR-25 | Quản trị khuyến mãi | class-domain | /api/admin/* | promotions-table.test.tsx; TC-18 |
| FR-26 | Quản trị tài khoản và vai trò | usecase-overview | /api/admin/users | auth.e2e-spec.ts; TC-18 |
| FR-27 | Giao hàng tận nơi | Ngoài phạm vi MVP | Không triển khai | Không áp dụng |
| FR-28 | Thanh toán tiền thật | Ngoài phạm vi MVP | Chỉ thanh toán mô phỏng | Không áp dụng |
| FR-29 | Báo cáo nâng cao | Chức năng Could | Chưa xác nhận | Chưa xác nhận |
| FR-30 | Bảo vệ mật khẩu | Thiết kế xác thực | /api/auth/register | auth.e2e-spec.ts; TC-01 |
| FR-31 | Làm mới phiên đăng nhập | Thiết kế xác thực | POST /api/auth/refresh | auth.e2e-spec.ts; SEC-02 |
| FR-32 | Xử lý trạng thái thanh toán UNKNOWN | sequence-checkout | Payment reconciliation | stage2-checkout.e2e-spec.ts; INT-10 |
| FR-33 | Cộng điểm khi thanh toán thành công | class-domain, sequence-checkout | Payment / Loyalty service | commerce.e2e-spec.ts; TC-17 |
| FR-34 | Giới hạn OTP và xác thực | Thiết kế xác thực | Auth service | auth.e2e-spec.ts; SEC-03 |
| FR-35 | Khách tìm kiếm và lọc sản phẩm | usecase-overview | GET /api/products | product-category-filter.test.tsx |
| FR-36 | Push notification / đa chi nhánh | Ngoài phạm vi MVP | Không triển khai | Không áp dụng |

### Quy ước tên tài liệu
- `usecase-overview`: docs/diagrams/usecase-overview.puml
- `activity-checkout`: docs/diagrams/activity-checkout.puml
- `sequence-checkout`: docs/diagrams/sequence-checkout.puml
- `class-domain`: docs/diagrams/class-domain.puml
- Các file `.e2e-spec.ts`: thuộc apps/api/test/
- Các file `.test.tsx`: thuộc apps/web/tests/

### Giới hạn truy vết
Các liên kết cần được rà soát với nội dung chi tiết
của từng sơ đồ để xác nhận mỗi sơ đồ thực sự thể hiện
yêu cầu tương ứng. Các mã TC/SEC/INT là tham chiếu
kịch bản nghiệm thu từ SRS, không mặc nhiên chứng
minh kịch bản đó đã Pass.


### Danh mục tạo phẩm truy vết

**Sơ đồ UML**

- [Use-case tổng quan](diagrams/usecase-overview.puml)
- [Activity – Đặt và thanh toán](diagrams/activity-checkout.puml)
- [Sequence – Đặt và thanh toán](diagrams/sequence-checkout.puml)
- [Class – Mô hình miền](diagrams/class-domain.puml)
- [Deployment – AWS](diagrams/deployment-aws.puml)

**Kiểm thử backend**

- [Auth E2E](../apps/api/test/auth.e2e-spec.ts)
- [Commerce E2E](../apps/api/test/commerce.e2e-spec.ts)
- [Checkout E2E](../apps/api/test/stage2-checkout.e2e-spec.ts)
- [Cart E2E](../apps/api/test/p3-cart.e2e-spec.ts)
- [Inventory E2E](../apps/api/test/p2-inventory.e2e-spec.ts)
- [Cart pricing E2E](../apps/api/test/cart-pricing.e2e-spec.ts)

**Kiểm thử frontend**

- [Catalog page](../apps/web/tests/catalog-page.test.tsx)
- [Product detail](../apps/web/tests/product-detail.test.tsx)
- [Orders view](../apps/web/tests/orders-view.test.tsx)
- [Promotions table](../apps/web/tests/promotions-table.test.tsx)
- [Product category filter](../apps/web/tests/product-category-filter.test.tsx)
- [Checkout flow](../apps/web/tests/checkout-flow.test.tsx)


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


## Ma trận truy vết phi chức năng – Task 8.1

Bảng liên kết các yêu cầu phi chức năng trong SRS
với thiết kế, cấu hình, mã nguồn và kiểm thử thực tế.

Quy ước: "Có test" chỉ xác nhận tồn tại kịch bản
kiểm thử. Trạng thái đạt yêu cầu phải được chứng minh
bằng kết quả chạy test hoặc minh chứng nghiệm thu.

| Mã yêu cầu | Use-case/User Story | Thiết kế/Sơ đồ | Code/API | Test / Minh chứng |
|---|---|---|---|---|
| NFR-01 | Hiệu năng xem menu | deployment-aws | GET /api/products | PERF-01; stage2-checkout.e2e-spec.ts (baseline cục bộ, chưa thay thế phép đo k6) |
| NFR-02 | Hiệu năng đặt hàng | sequence-checkout | POST /api/orders | PERF-02; chưa xác minh phép đo tải yêu cầu |
| NFR-03 | Bảo mật phân quyền | usecase-overview, class-domain | Auth guards, Roles | SEC-01; auth.e2e-spec.ts; commerce.e2e-spec.ts |
| NFR-04 | Bảo mật đăng nhập và phiên | Thiết kế Auth/Session | /api/auth/* | SEC-02/03; auth.e2e-spec.ts |
| NFR-05 | Toàn vẹn giao dịch | sequence-checkout, class-domain | Commerce / Inventory / Payment services | INT-05 đến INT-10; commerce.e2e-spec.ts; stage2-checkout.e2e-spec.ts |
| NFR-06 | Giao diện dễ sử dụng | usecase-overview | Next.js frontend | UX-01; cần kết quả kiểm thử các viewport |
| NFR-07 | Khả năng tiếp cận | Thiết kế giao diện | Next.js frontend | UX-02; chưa có báo cáo đánh giá WCAG |
| NFR-08 | Khả năng cài đặt độc lập | deployment-aws | Docker Compose, README | DEP-01; chưa có minh chứng người ngoài nhóm chạy từ clone mới |
| NFR-09 | Triển khai an toàn | deployment-aws | compose.prod.yml, HTTPS, /api/health | DEP-02; ảnh 11–15 Task 5.4; cần xác minh thêm cấu hình AWS |
| NFR-10 | Kiểm thử phần mềm | sequence-checkout | apps/api/test, apps/web/tests | QA-01; CI PR #22; cần đối chiếu E2E trình duyệt |
| NFR-11 | Tích hợp và triển khai liên tục | deployment-aws | .github/workflows/ci.yml, cd.yml | QA-02; CI PR #22 đạt; CD production chưa xác minh thực thi |
| NFR-12 | Dễ bảo trì và truy vết | class-domain, tài liệu kiến trúc | README, docs, source, tests | QA-03; repository và PR #22 |
| NFR-13 | Khả năng khôi phục khi lỗi | sequence-checkout | Payment reconciliation / rollback | INT-10; stage2-checkout.e2e-spec.ts; chưa chứng minh rollback production |
| NFR-14 | Giám sát hệ thống | deployment-aws | GET /api/health | OPS-01; health HTTP 200; chưa đánh giá đầy đủ request logging |
| NFR-15 | Khả dụng khi demo | deployment-aws | Production HTTPS | OPS-02; kiểm tra HTTP 200 ngày 21/11/2026; chưa đo đủ 60 phút |
| NFR-16 | Ghi nhận lịch sử thao tác | class-domain | Order status events / audit | OPS-03; commerce.e2e-spec.ts; cần kiểm tra phạm vi audit đầy đủ |
| NFR-17 | Chất lượng dữ liệu | class-domain | Prisma schema, transaction services | DATA-01; p2-inventory.e2e-spec.ts; cart-pricing.e2e-spec.ts |
| NFR-18 | Giao diện responsive | usecase-overview | Next.js components | UX-03; catalog-page.test.tsx; checkout-flow.test.tsx; cần kiểm thử viewport thực tế |

### Ghi chú đánh giá

- Các tên sơ đồ là tham chiếu đến tạo phẩm có trong
  `docs/diagrams/`; cần kiểm tra nội dung sơ đồ khi
  kết luận mức độ bao phủ của từng NFR.
- Các bài test được liệt kê là vị trí kiểm thử liên quan,
  không mặc nhiên chứng minh toàn bộ tiêu chí SRS đã đạt.
- CI PR #22 đã có 5 checks thành công; điều này không
  đồng nghĩa workflow CD đã triển khai production.
- Production đã phản hồi HTTPS và health thành công
  ngày 21/11/2026; cần kiểm tra lại tại thời điểm chấm.

## Non-functional requirements

> **Lưu ý về trạng thái:** Bảng dưới đây ghi nhận baseline P0
> ngày 07/11/2026. Các giá trị `Planned` là trạng thái
> lịch sử tại thời điểm lập baseline, không phản ánh
> toàn bộ kết quả triển khai sau đó. Ma trận truy vết
> Task 8.1 ở phía trên bổ sung các tạo phẩm và minh chứng
> đã xác định. Việc một yêu cầu có mã kiểm thử hoặc file
> test không đồng nghĩa tất cả tiêu chí nghiệm thu đã đạt.

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

## Assignment alignment — 2026-11-09 (supersedes affected P0 rows)

| Yêu cầu | Hiện thực | Bằng chứng |
|---|---|---|
| A1 Task 5 | Header badge từ CartProvider | logout-navigation/header-account tests |
| A1 Task 6/8 | Order PENDING, PAYMENT_FAILED; giữ giỏ khi FAILED; retry | stage2-checkout HTTP integration |
| A1 Task 9 | GET /api/orders/me; endpoint cũ vẫn giữ | stage2 ownership/alias integration |
| A1 Task 8/10 | POST /api/payments; JWT, validation, idempotency | stage2 alias/replay/ownership integration |
| A1 Task 10 / FR-33 | EARN tại PAID, không cộng lại tại COMPLETED | commerce integration + stage2 duplicate settlement |

Không thay thế minh chứng CD/release/Scrum/UML; các mục đó vẫn cần nghiệm thu riêng. Không khẳng định GitHub CI mới đã chạy khi chưa commit/push.


## Delivery preparation — 2026-11-09

Task 2/3: [UML source/export index](diagrams/README.md), [ADR-0002](architecture/adr/0002-controlled-ec2-delivery.md). Task 5 CD implementation prepared: [setup and rollback](../deploy/CD-SETUP.md), `.github/workflows/cd.yml`; actual Actions evidence pending. Performance baseline and remaining acceptance gates: [delivery readiness](delivery/readiness.md). PAID cancellation remains explicitly unresolved pending policy confirmation.


## PAID mock cancellation — 2026-11-09

| Requirement | Code / API | Evidence |
|---|---|---|
| Assignment 1 PAID -> CANCELLED | CommerceService.cancel/refundPaid; expectedVersion + Idempotency-Key | Stage2 full mock refund and replay tests |
| No double refund | Refund.paymentId unique; order row lock; unique ledger types | concurrent cancellation keys; same-key replay |
| No preparation/cancel race | transition and cancel lock same Order | actual concurrent HTTP STAFF vs CUSTOMER test |
| Restore resources | InventoryService.restoreSold, guarded coupon usedCount, REFUND + EARN_REVERSAL | stock/coupon/ledger assertions and injected rollback |
| Original payment truth | Payment SUCCESS retained; separate Refund SUCCESS | HTTP payment detail + UI refund tests |
| Unspent-point protection | balance + redeemed - earned >= reservedPoints | spent and reserved-point cases return 409 with no writes |
| External gateway boundary | VNPay EXTERNAL_REFUND_UNSUPPORTED | signed-success fixture then refusal, zero Refund records |

PAID version is mandatory; unpaid requests without version remain backward compatible. All refund mutations in these tests are on dedicated databases, not operating transactions.

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
