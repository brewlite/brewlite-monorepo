# Giai đoạn 1 — Khả dụng sản phẩm và nhập tồn kho

Ngày kiểm tra: 07/11/2026. Phạm vi: catalog, Inventory, giao diện ADMIN/Customer và regression tests. Chưa triển khai VNPay, không thay schema/migration hoặc nhập tồn trên database vận hành.

## Hiện trạng PostgreSQL vận hành

| Chỉ số | Giá trị |
| --- | ---: |
| Product | 25 |
| Product bật bán | 25 |
| Size | 50 |
| Size bật bán | 50 |
| Size có tồn khả dụng | 0 |
| Size chưa nhập tồn (`onHand IS NULL`) | 50 |
| Size có Reserved khác 0 | 0 |
| Size có version khác 0 | 0 |
| Category ngừng hoạt động | 0 |

Kiểm tra chỉ đọc đầu/cuối đều xác nhận nguyên nhân chung: tất cả Size chưa được ADMIN nhập tồn. Product.isAvailable=true và stockQuantity legacy không đủ để cho phép đặt món. Không chuyển stockQuantity sang Size.onHand.

Từng món đều có lý do này: Affogato, Americano, Bạc Xỉu, Cold Brew, Cà Phê Muối, Cà Phê Trứng, Cà phê sữa đá, Cà phê sữa đá BrewLite, Dalgona, Espresso, Latte Hạnh Nhân, Matcha Đá Xay Kem Tuyết, Tiramisu Latte, Trà Dâu, Trà Nho, Trà Sữa Dâu, Trà Sữa Hoa Đậu Biếc, Trà Sữa Socola, Trà Sữa Truyền Thống, Trà Sữa Ô Long Nướng, Trà Thanh Long, Trà Vải Hoa Hồng, Trà Đào Cam Sả, Yaourt Đá Xay, Đá Xay Oreo. Tên “Cà phê sữa đá” hiện có khoảng trắng cuối trong database; không sửa dữ liệu ở giai đoạn này.

## Thay đổi

- Card/Detail dùng helper chung phân biệt món ngừng bán, danh mục ngừng bán, Size ngừng bán, chưa chọn Size, chưa nhập tồn, hết hàng, không đủ số lượng và số lượng ngoài giới hạn.
- Detail không tự chọn Size rẻ nhất. Khách chủ động chọn Size; lựa chọn topping không bị tự bỏ khi Size chưa nhập tồn. Ảnh, tên, mô tả, giá và lựa chọn vẫn xem được.
- Request catalog/detail dùng `cache: no-store`; refetch/refresh lấy tồn mới. Catalog list vẫn chỉ liệt kê Product bật bán trong Category hoạt động. Detail theo ID cho phép đọc món đã ngừng bán để giải thích trạng thái thay vì trả 404; ID không tồn tại vẫn 404. Validation thêm giỏ/quote không bị nới lỏng.
- Backend trả mã/nguyên nhân ngừng bán riêng cho Product/Category/Size. Giữ kiểm tra đúng Product–Size, topping hợp lệ, onHand/reserved và tổng số lượng cùng SKU tại cart/quote/Order. Thêm giỏ không reserve/consume.
- ADMIN Size API bổ sung `availableQuantity` và `sellingStatus` dựa trên Product, Category và Size. Giữ guard ADMIN, version/CAS, audit từng thao tác.
- ADMIN UI hiển thị tất cả Size, tìm kiếm tiếng Việt không dấu/lọc Product, On hand/Reserved/Available/trạng thái. Input tồn ban đầu trống. Có preview/xác nhận trước lưu, thông báo thành công/thất bại, Refresh sau conflict; không tự retry ghi hoặc tự điền tồn. Bảng có cuộn ngang riêng để tránh bó hẹp cột và không tràn toàn trang trên mobile.
- Chưa thêm nhập hàng loạt; nhập từng Size đáp ứng phạm vi hiện tại.

## Files chỉnh sửa/tạo trong giai đoạn này

Backend:

- `apps/api/src/products/products.service.ts`
- `apps/api/src/inventory/inventory.service.ts`
- `apps/api/src/commerce/admin.service.ts`
- `apps/api/test/p3-cart.e2e-spec.ts`

Frontend:

- `apps/web/app/admin/page.tsx`
- `apps/web/app/roast-theme.css`
- `apps/web/components/product/inventory-editor.tsx` (mới)
- `apps/web/components/product/product-detail.tsx`
- `apps/web/components/menu/product-card.tsx`
- `apps/web/lib/product-availability.ts` (mới)
- `apps/web/types/product.ts`
- `apps/web/services/product.service.ts`
- `apps/web/tests/inventory-editor.test.tsx` (mới)
- `apps/web/tests/product-availability.test.ts` (mới)
- `apps/web/tests/product-detail.test.tsx`
- `apps/web/tests/product-compat.test.tsx`
- `apps/web/tests/page.test.tsx`

E2E: `tests/p3-browser.cjs`. Tài liệu: báo cáo này. File import sản phẩm/18 ảnh mới, AGENTS.md, .history và A05 đã tồn tại trước lượt này, không đưa vào phạm vi thay đổi của giai đoạn 1.

## Kiểm chứng

| Bước | Kết quả |
| --- | --- |
| Backend lint và TypeScript | Passed |
| Backend unit | 53 tests Passed |
| P2 integration | 9 tests Passed, database test riêng |
| P3 integration + browser | 12 tests Passed: 11 HTTP + 1 luồng browser, database test riêng |
| Backend `nest build` | Passed |
| Backend `npm run build` đầy đủ | Prisma generate lỗi EPERM rename DLL đang bị tiến trình khác giữ; không coi bước này Passed |
| Frontend lint, TypeScript | Passed |
| Frontend unit | 84 tests Passed / 17 files |
| Frontend build | Passed |

Ca HTTP mới: Size NULL bị từ chối; CUSTOMER/STAFF không nhập tồn (403); ADMIN nhập onHand=5 với version=0, version cũ sau đó bị 409; list/detail đọc tồn mới; CUSTOMER chọn Size, topping, quantity=2, note, thêm giỏ và GET lại giỏ; quote bằng Backend ra 86.000đ; onHand vẫn 5/reserved vẫn 0; chỉ một audit nhập tồn. Mọi dữ liệu của ca này chỉ trong database test.

Browser dùng Next dev thật → Nest test thật → PostgreSQL test riêng; không giả response API. Đã chạy Menu, Detail, Cart, ADMIN Inventory ở desktop 1440px/mobile 390px, đăng nhập bằng fixture test, guest merge, sửa/xóa/reload giỏ và nhập tồn qua xác nhận. Không có lỗi runtime/hydration và không tràn ngang toàn trang. Các bảng dài có cuộn ngang riêng. Ảnh kiểm tra nằm ngoài Git tại `D:\BrewLite-P3-temp\brewlite-p3-*.png`.

## Sử dụng và điều kiện còn lại

1. Khởi động/restart Backend bằng script dự án để nạp source mới; giữ Docker/PostgreSQL và Next đang chạy.
2. Đăng nhập ADMIN → Size và tồn kho → tìm/lọc Product → nhập số tồn thực tế của đúng Size → Lưu tồn → kiểm tra preview → Xác nhận lưu. Chỉ người quản trị quyết định lượng tồn thật.
3. CUSTOMER refresh Detail, tự chọn Size đã nhập tồn, chọn topping/số lượng/ghi chú, thêm giỏ và tính tổng. Luồng này đã được kiểm chứng trên database test; database vận hành hiện chưa có Size đủ tồn để tuyên bố đã đặt món thật thành công.
4. Đóng tiến trình đang giữ Prisma DLL khi phù hợp rồi chạy lại build Backend đầy đủ. Không tự dừng ứng dụng người dùng hoặc xóa DLL.
5. Trước VNPay cần nghiệm thu riêng luồng Order/reservation/expiry, callback/IPN có xác minh chữ ký và idempotency, đối chiếu amount/order, cấu hình sandbox/HTTPS và xử lý giao dịch thất bại. Các prototype hiện có không thay cho nghiệm thu này.

Không ghi vào database vận hành; không sửa ADMIN/CUSTOMER, .env, AGENTS.md, stash; không seed/reset/xóa dữ liệu; không commit/push/merge.
