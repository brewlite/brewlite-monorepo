# Tích hợp hồ sơ tài khoản và chi tiết đơn Admin — local

Ngày: 13/11/2026. Nhánh thử: `feature/admin-details-local`.

## Nguồn và bảo vệ thay đổi

- Nội dung PR #21 (`origin/feature/admin-user-details`, `9e34178`) được tích hợp vào working tree; không tạo merge commit, không commit/push và không sửa main trên GitHub.
- Giữ hộp chi tiết đơn theo mẫu đã chỉnh và mở bằng click cả dòng, Enter/Space. Các file chồng lấn được tích hợp có chọn lọc thay vì ghi đè.
- Bản sao trước tích hợp: `D:/BrewLite-P3-temp/admin-details-backup-20261113-210452` (manifest, patch và nội dung file).
- Không sửa .env/.env.local, AGENTS.md hay stash. Không thay đổi schema/migration hoặc nhập fixture vào database vận hành.

## Phần bổ sung

- `GET /api/admin/users/:id/detail`: id, họ tên, email, vai trò, trạng thái, xác minh email, ngày tạo, điểm thưởng. Chỉ select dữ liệu cần thiết, không trả passwordHash, OTP hay session/token.
- `GET /api/admin/users/:id/activity`: số đơn không-legacy từng có thao tác của tài khoản, tổng số lần cập nhật, phân nhóm trạng thái và tối đa 20 sự kiện mới nhất. Hỗ trợ STAFF/ADMIN; không gọi đây là đơn được phân công.
- Cả hai endpoint nằm dưới JWT/Origin/ADMIN guards và ParseUUIDPipe. CUSTOMER/STAFF không được đọc API hồ sơ Admin.
- Hồ sơ khách hàng giữ thống kê, điểm thưởng, danh sách đơn/phân trang và mở tóm tắt đơn của PR21.
- Hồ sơ STAFF/ADMIN thêm hoạt động thực tế và mở đơn từ sự kiện; không hiển thị điểm thưởng/thống kê mua hàng như CUSTOMER.
- Từ chi tiết đơn, ADMIN bấm tên khách/nhân viên để mở cùng giao diện hồ sơ. Không bị giới hạn bởi 100 tài khoản trong bảng vì có endpoint tải trực tiếp theo id.
- Esc đóng hồ sơ trên cùng, giữ đơn phía sau. Sửa preventDefault/stopPropagation ở CenteredDialog sau khi trình duyệt thực phát hiện lỗi đóng cả hai modal.
- Giữ source chọn dòng, modal đen trắng, trạng thái thiếu dữ liệu và không dùng người/ID giả trên giao diện vận hành.

## File trọng tâm

Backend: commerce/admin.controller.ts, admin.service.ts, commerce.service.ts; admin.profile.spec.ts và test/commerce.e2e-spec.ts.
Frontend: admin/catalog-management.tsx, admin/order-monitor.tsx, admin/admin-order-detail.tsx và CSS, admin/admin-linked-account-dialog.tsx, admin/admin-staff-activity.tsx, ui/centered-dialog.tsx, services/store.service.ts, tests/admin-linked-account.test.tsx và tests liên quan.
Các file auth/API URL/Admin gate và tests của PR21 cũng được tích hợp. `tests/admin-details-browser.cjs` kiểm tra trình duyệt bằng API thật trong database test.

## Kiểm chứng

- Backend: lint Passed; TypeScript noEmit Passed; 90 unit tests Passed; full build Passed.
- Frontend: 176 tests Passed; production build Passed; lint Passed.
- Integration cuối: 26 Passed (gồm browser Admin), 70 skipped thuộc các suite giai đoạn khác không bật trong runner này. P2 invariants riêng: 9 Passed.
- HTTP: không đăng nhập 401; CUSTOMER/STAFF 403; ADMIN đọc hồ sơ/thống kê thật từ fixture. Một đơn qua 3 bước được tính 1 đơn tham gia, 3 lần cập nhật; retry không nhân đôi.
- Browser: Edge headless, 1440x1000 và 390x844, 14 request đến Nest test thật; không mock business responses. Mở hồ sơ nhân viên/khách từ đơn, đóng bằng Esc/nút X, giữ hộp đơn; 0 lỗi runtime/hydration; không tràn ngang ở các modal đã chụp.
- Ảnh fixture-only: thư mục Temp của Windows, tên `brewlite-admin-order-*`, `brewlite-admin-staff-profile-*`, `brewlite-admin-customer-profile-*`.
- Test PostgreSQL: container `brewlite-admin-details-test-20261113`, bind `127.0.0.1:55439`; database `brewlite_test_control`, schema cuối `brewlite_auth_test_1794579620955`; P2 database `brewlite_p2_test_1794579657886`. Giữ lại để kiểm tra, không reset/drop/seed vận hành.
- Local phục vụ người dùng: Next dev :3000 và Nest :3001, HTTP 200. Frontend E2E :3100 đã dừng sau kiểm tra; API E2E tự đóng.

## Giới hạn

- Không thêm phân công độc quyền hoặc khóa đơn theo người nhận. Nhân viên vẫn theo quy tắc hàng đợi chung và version/idempotency hiện hữu.
- Tên/vai trò hồ sơ là dữ liệu tài khoản hiện tại; chưa có snapshot danh tính lịch sử.
- Không có thay đổi hoặc rollout AWS. Nhánh/working tree cần review trước commit/PR riêng.


## Cập nhật giao diện và dùng chung chi tiết đơn — 13/11/2026

- Thay nhánh “Tóm tắt đơn hàng” bằng `AdminOrderDetailView`: cùng nội dung cho Giám sát đơn, đơn gần đây của khách, danh sách đã lọc/phân trang và sự kiện của nhân viên.
- `order-detail-dialog.tsx` chỉ tải đúng `/admin/orders/:id`, xử lý loading/error/retry rồi dùng lại view chung. Dữ liệu hiển thị được gắn id yêu cầu, không giữ nội dung đơn trước trong lúc tải đơn mới.
- Thêm `account-order-list.tsx` cho dòng đơn có thể bấm, mã rút gọn có title/aria-label đầy đủ, thời gian Việt Nam, nhãn trạng thái và tổng tiền. Không thay đổi mã đơn thật.
- Hồ sơ dùng `account-profile.css`: header cố định và vùng cuộn riêng; thông tin dạng cặp nhãn–giá trị, thẻ thống kê của khách, hai thẻ hoạt động và thanh tỷ lệ của nhân viên; các sự kiện bấm cả dòng để mở đơn thật.
- Nút quay lại từ đơn giữ bước gốc (hồ sơ hoặc danh sách đã lọc/tải thêm). Hồ sơ nhân viên có tiêu đề và mã nhân viên riêng. Dữ liệu trong HTML mẫu không được đưa vào vận hành.
- Giữ liên kết ADMIN từ chi tiết đơn sang hồ sơ người khác, kể cả khi đơn được mở từ hồ sơ khách; đóng hộp trên cùng không đóng bước phía sau. Focus được đặt trong màn hình mới sau khi điều hướng.
- Frontend: 179 tests Passed; 25 tests điều hướng/dialog/loader chạy lại sau chỉnh focus đều Passed; lint không còn cảnh báo; production build Passed.
- Integration/browser cuối: 26 Passed, 70 skipped thuộc các suite không bật trong runner; P2 9 Passed. Test schema `brewlite_auth_test_1794581219697`, P2 database `brewlite_p2_test_1794581258787`, cùng container test cổng55439.
- Edge: 22 request đến API test thật; chọn đơn khác từ hồ sơ khách, mở đơn từ lịch sử nhân viên, mở tiếp hồ sơ nhân viên từ đơn khác, quay lại giữ bộ lọc; 0 lỗi runtime/hydration, không tràn ngang ở desktop1440x1000 và mobile390x844. Ảnh `brewlite-admin-staff-order-*`, `brewlite-admin-customer-other-order-*`, `brewlite-admin-customer-filtered-list-mobile.png` và các ảnh hồ sơ trong Temp.
- Không đổi nghiệp vụ/API/DB vận hành trong lần chỉnh giao diện này; không commit/push/deploy.
