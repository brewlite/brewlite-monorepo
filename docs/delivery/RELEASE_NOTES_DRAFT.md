# BrewLite - Release Notes

## Thông tin phiên bản

- Phiên bản dự kiến: v1.0.0
- Trạng thái: Draft - chưa phát hành
- Repository: https://github.com/brewlite/brewlite-monorepo
- Commit được kiểm tra: 30a66791d88fb4bcccedfdea5674e111a4937aac

## Chức năng chính

- Xem danh sách và chi tiết sản phẩm.
- Chọn kích thước, topping và số lượng.
- Quản lý giỏ hàng và tạo đơn.
- Đăng ký, xác minh OTP và đăng nhập.
- Thanh toán ví/thẻ mô phỏng.
- Xem trạng thái và lịch sử đơn hàng.
- Nhân viên xử lý đơn đã thanh toán.
- Quản trị viên quản lý sản phẩm, tồn kho và đơn hàng.

## Kiểm thử và đóng gói

- CI thực hiện lint, unit test, build và integration test.
- Deployment safety tests: 6/6 passed.
- Docker image API và Web đã được build theo commit SHA.
- Hai image đã được xuất bản lên GHCR.
- Frontend và API production hiện tại phản hồi HTTP 200.
- API health check trả về status: ok.

## Giới hạn và lưu ý

- Thanh toán sử dụng ví/thẻ mô phỏng, không thu tiền thật.
- CD production chưa được thực thi qua GitHub Actions.
- Chưa có bằng chứng diễn tập khôi phục PostgreSQL trên EC2.
- Chưa xác nhận website production đang chạy đúng commit dự kiến phát hành.

## Hướng dẫn

- README.md: Chạy hệ thống trên máy local.
- docs/deployment.md: Cài đặt và triển khai.
- deploy/CD-SETUP.md: Quy trình CD, migration và rollback.
