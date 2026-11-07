# Giai đoạn 2 — Checkout, Order và VNPay Sandbox

Ngày: 07/11/2026 (Asia/Saigon). Repository `D:\brewlite-monorepo`, nhánh `feature/menu-api-compat`. Tiếp tục source hiện có; các thay đổi Giai đoạn 1 được giữ nguyên. Không commit/push/merge/stash/reset/clean.

## 1. Trạng thái và dữ liệu vận hành

Audit PostgreSQL vận hành chỉ đọc đầu/cuối: 25 Product, 50 Size, tất cả 50 Size có onHand=NULL/reserved=0; 3 Order và 3 Payment legacy, không có Order mới (`isLegacy=false`). Không nhập tồn, tạo fixture, tạo thanh toán hoặc thay tài khoản ADMIN/CUSTOMER trên brewlite_db. Không dùng Product.stockQuantity làm tồn theo Size. Không sửa .env/.env.local hoặc migration/schema.

Inventory NULL vẫn chặn đặt món vận hành đúng chính sách. Điều này không chặn phát triển: mọi bài kiểm thử ghi dữ liệu dùng database riêng.

## 2. Checkout và Order

- Tái sử dụng CommerceService, InventoryModule và schema hiện có.
- Cart.version, cấu hình Size/Topping/Quantity/Note, giá/catalog, tổng số lượng các cấu hình cùng Size, coupon/quota và số điểm khả dụng được kiểm tra lại trong transaction Serializable.
- Dùng primitive reserve/consume/release có điều kiện của InventoryService, tăng version để tương thích ADMIN CAS. Thêm giỏ không giữ/trừ tồn; tạo Order mới giữ tồn.
- Bổ sung retry có giới hạn cho lỗi raw SQL PostgreSQL serialization/deadlock (P2010/40001, 40P01), ngoài P2034/P2002 hiện có. Ca hai khách tranh Size cuối trước đây có thể trả 500; nay một bên thành công và bên còn lại nhận conflict.
- Order tạo ở PENDING_PAYMENT, có OrderItem/OrderItemTopping snapshot, OrderReservation HELD và OrderStatusHistory. Không PAID trước xác nhận thanh toán.
- Idempotency-Key cùng payload không tạo thêm Order/Payment; payload khác trả 409. Frontend lưu key/body yêu cầu tạo đơn trong session để khôi phục sau mất phản hồi; không tự thay payload chưa rõ kết quả.
- Thành công: atomically consume tồn, giải phóng reserved points/coupon, ghi REDEEM/notification/history, Order PAID và Payment SUCCESS.
- Thất bại xác nhận: Payment FAILED, giữ reservation cho retry/cancel đến hạn theo baseline. Cancel/expiry release một lần, không trừ onHand. UNKNOWN/PENDING không được hủy hoặc retry thanh toán mù quáng.

## 3. VNPay Sandbox

Tài liệu chính thức:

- [Thanh toán PAY, chữ ký và IPN](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html)
- [QueryDr và checksum đối soát](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html)

Đã triển khai:

- VNPayService: canonical sort/encode, HMAC-SHA512, timing-safe verification, VND ×100 bằng số nguyên, GMT+7, TxnRef riêng cho mỗi attempt, expire date theo hạn giữ Order.
- URL gateway cố định Sandbox; không cho cấu hình chuyển sang cổng thu tiền thật. Frontend cũng kiểm tra origin/path trước redirect.
- Request `method=VNPAY` chọn adapter. Schema PaymentMethod hiện có được giữ nguyên: lưu CARD và đánh dấu providerPaymentId bằng `vnpay:<TxnRef>`; UI nhận diện provider để hiển thị VNPay Sandbox. Không tạo enum/migration mới ngầm.
- `POST /api/orders/:id/payments`: owner CUSTOMER, idempotency, attempt limit, reservation/order expiry, chặn attempt mới khi chưa rõ kết quả.
- `GET /api/payments/vnpay/return`: kiểm tra chữ ký/merchant/ref/amount rồi redirect tới trang kết quả; **không settlement theo browser Return**.
- `GET /api/payments/vnpay/ipn`: server-to-server, không yêu cầu JWT cookie; bắt buộc chữ ký, merchant, TxnRef và amount hợp lệ. Reject query lồng/duplicate, hash sai, merchant sai, amount sai và ref không tồn tại. RspCode theo tài liệu.
- PaymentEvent chống callback trùng và giữ audit cho phản hồi bất thường. Không ghi đè SUCCESS thành FAILED; mã giao dịch provider bị dùng cho Payment khác được chuyển đối soát thay vì consume thêm tồn.
- Late/conflicting SUCCESS không hồi tố PAID sau khi trạng thái không còn hợp lệ; ghi REQUIRES_REVIEW, giữ kết quả an toàn.
- QueryDr ký request và xác minh checksum/merchant/ref/amount/type/status của response; request nằm ngoài DB transaction, timeout không biến thành FAILED.
- `POST /api/payments/:id/reconcile`: CUSTOMER chỉ đối soát Payment của mình. Giới hạn 60 giây giữa các inquiry, tối đa 10 lần mỗi Payment trong một tiến trình. Có worker khi chủ động bật VNPAY_RECONCILE_ENABLED; chưa xác nhận thì giữ UNKNOWN/hold để xử lý vận hành. Bộ giới hạn này không bền qua restart hoặc chia sẻ nhiều instance; cần storage chung khi mở rộng triển khai.
- Mock Payment giữ riêng, không bao giờ settle Payment có prefix VNPay. Ngoài NODE_ENV=test, cần bật ENABLE_MOCK_PAYMENTS mới cho tạo mock; UI mock cần NEXT_PUBLIC_ENABLE_MOCK_PAYMENTS. Mặc định không hiện nút mock.

## 4. Frontend

- Xác nhận mua: coupon, điểm, tính lại tổng Backend, chọn VNPay Sandbox, tạo Order pending và chuyển tới chi tiết đơn. Có đồng bộ lại giỏ khi lỗi và khôi phục request tạo đơn chưa rõ kết quả.
- Chi tiết đơn: nút VNPay Sandbox, request key ổn định khi mất phản hồi; redirect chỉ theo URL Sandbox hợp lệ. Không tạo attempt mới khi Payment PENDING/UNKNOWN.
- `/payments/result?paymentId=...`: đọc API được bảo vệ, polling PENDING/UNKNOWN; hiển thị SUCCESS/FAILED/UNKNOWN theo Backend, có yêu cầu đối soát, link chi tiết đơn/lịch sử.
- Lịch sử và chi tiết đơn đọc snapshot/history/payment thực từ Backend. Không suy ra thành công từ query string của Return URL.

## 5. Môi trường và fixture kiểm thử

Runner tái sử dụng P2/P3, bổ sung phase stage2. URL chỉ chấp nhận database tên `brewlite_stage2_test_*`, khác database vận hành, schema public. Áp dụng 4 migration hiện có; xác minh current_database trước tạo fixture. Không reset/drop/seed hoặc fallback về brewlite_db.

Database kiểm chứng cuối gồm:

- `brewlite_stage2_test_1794051674489`: 10 HTTP tests + 1 production UI flow Passed.
- `brewlite_p2_test_1794051108631`: 9 regression tests Passed.
- `brewlite_p3_test_1794051115464`: 11 HTTP regression tests Passed; browser P3 không bật trong lượt hồi quy này.

Các database test từ lần thử trước được giữ lại, không tự xóa. Chúng không phải dữ liệu vận hành.

Fixture: 2 CUSTOMER có email test và verified, password bcrypt riêng test, 100 điểm ban đầu; mỗi ca có Product/Size/topping riêng, giá 35.000đ + topping 5.000đ; tồn thử có chủ đích 20 hoặc 1, ca NULL/zero/topping sai được thiết lập trong database test. Promotion/loyalty chỉ tạo/sửa khi ca kiểm thử cần. Test signer sinh ngẫu nhiên trong process và merchant label test chỉ dùng để kiểm tra chữ ký, không phải merchant Sandbox thật; không ghi vào .env.

E2E dùng Next production build riêng tại `http://localhost:3100`, Nest test port ngẫu nhiên và database test. CDP chỉ chuyển transport API về test Backend; response nghiệp vụ là dữ liệu thật từ Nest/PostgreSQL test. Truy cập gateway Sandbox bị chặn có chủ đích; test gửi IPN ký kiểm soát, **không gọi đó là giao dịch VNPay Sandbox thật**.

Lệnh tại apps/api: `npm.cmd run test:stage2`. Để chạy UI, mở production Next trên 3100 sau build; đặt STAGE2_BROWSER=1 và FRONTEND_E2E_URL=http://localhost:3100 cho riêng process test rồi chạy script. Không sửa .env thật.

## 6. Kết quả kiểm thử

| Kiểm tra | Kết quả |
| --- | --- |
| Backend lint / TypeScript | Passed |
| Backend unit | 59 Passed / 8 suites |
| Backend build | npm run build đã Passed sau giải phóng DLL; nest build và typecheck của source cuối Passed |
| Stage2 HTTP + production UI | 11 Passed (10 HTTP + 1 UI flow) |
| P2 regression | 9 Passed |
| P3 HTTP regression | 11 Passed, 1 browser test không bật |
| Frontend lint / TypeScript | Passed |
| Frontend unit | 89 Passed / 19 files |
| Frontend build | Passed, có route payments/result |
| Giao dịch Sandbox với merchant thật | Chưa kiểm chứng — thiếu cấu hình |

Coverage: quote/coupon/points và REDEEM đúng một lần, snapshot/hold/history, cùng key/different payload, stale cart/price, NULL inventory, topping sai, hai khách tranh tồn/coupon cuối, Return không PAID, IPN checksum/merchant/amount/ref, callback trùng, UNKNOWN chặn retry/cancel, FAILED/cancel/expiry, transaction ID reuse, lịch sử và ownership.

Browser đã chạy desktop 1440px/mobile 390px: Cart → Checkout → quote → Order pending → yêu cầu redirect Sandbox → UI chờ xác nhận → controlled signed IPN → Backend SUCCESS → UI thành công → lịch sử PAID. Không có runtime/hydration exception trong lượt production UI cuối; không tràn ngang toàn trang. Ảnh ở `D:\BrewLite-P3-temp\brewlite-p3-checkout-*.png` và `brewlite-p3-payment-result-*.png`, ngoài Git.

Hai lượt chạy trên Next dev từng ghi nhận cảnh báo hydration không ổn định dù nghiệp vụ hoàn tất. Chưa thu được DOM mismatch cụ thể; một lượt dev sau đó và lượt production riêng Passed. Không kết luận đã sửa tận gốc cảnh báo dev này; cần theo dõi thêm nếu tái hiện khi phát triển.

Prisma DLL: đã xác định và dừng đúng Prisma Studio PID 37612/40272, Nest watcher PID 37732 và API child PID 1156. Không xóa Prisma Client/DLL hoặc dữ liệu. Full build sau giải phóng khóa thành công; Backend watcher đã khởi động lại (PID 34948), `/api/health` trả 200. Prisma Studio không tự mở lại.

## 7. Files giai đoạn 2

Backend sửa: `.env.example`, `package.json`, `scripts/run-p2-tests.cjs`, `src/commerce/commerce.controller.ts`, `commerce.module.ts`, `commerce.service.ts` (đường dẫn tương đối apps/api).

Backend tạo: `apps/api/src/commerce/vnpay.service.ts`, `vnpay.controller.ts`, `vnpay.service.spec.ts`; `apps/api/test/stage2-checkout.e2e-spec.ts`.

Frontend sửa: `apps/web/components/checkout/purchase-flow.tsx`, `components/orders/orders-view.tsx`, `services/store.service.ts`.

Frontend tạo: `apps/web/services/checkout.service.ts`, `services/payment.service.ts`, `components/checkout/payment-result.tsx`, `app/payments/result/page.tsx`, `tests/checkout-retry.test.ts`, `tests/payment-result.test.tsx`.

E2E sửa `tests/p3-browser.cjs`; tạo báo cáo này. Những file Giai đoạn 1, ảnh sản phẩm, import script, AGENTS.md, .history/A05 đã có trong working tree trước lượt này; không quy toàn bộ git diff là Giai đoạn 2.

## 8. Điều kiện còn thiếu để chạy Sandbox thật

Audit tên cấu hình xác nhận thiếu cả VNPAY_TMN_CODE, VNPAY_HASH_SECRET, VNPAY_RETURN_URL trong môi trường hiện tại. Cần merchant Sandbox được VNPay cấp, IPN HTTPS công khai đăng ký đúng `/api/payments/vnpay/ipn`, Return URL phù hợp và IP máy chủ cho QueryDr. Mẫu không chứa secret nằm trong apps/api/.env.example. Không tự tạo credentials hoặc mở tunnel công khai.

Muốn kiểm thử trên brewlite_db vận hành: ADMIN chủ động nhập tồn thực tế cho Size được chọn, rồi đăng nhập CUSTOMER thật và thực hiện luồng. Không cần nhập hàng loạt 50 Size để tiếp tục phát triển. Vẫn cần một giao dịch Sandbox thật để xác nhận tương thích gateway, callback qua HTTPS/proxy và QueryDr trên merchant đã cấp; chưa coi giai đoạn thanh toán ngoài hệ thống là nghiệm thu đầy đủ.
