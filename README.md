# brewlite-monorepo
Hệ thống đặt cà phê BrewLite - Môn Công nghệ phần mềm

## Chạy trên máy thành viên

Cần Node.js 24, npm và Docker Desktop. Chạy hai terminal cho Backend/Frontend.

1. Clone repository hoặc cập nhật `main` bằng fast-forward khi working tree an toàn.
2. Tại root: `docker compose up -d postgres`. Không dùng `down -v`, reset hoặc seed toàn bộ.
3. Tại `apps/api`: `npm ci`. Sao chép `.env.example` thành `.env` **chỉ nếu chưa có**; cấu hình DATABASE_URL, JWT_SECRET ngẫu nhiên ít nhất 32 byte, Gmail SMTP/App Password riêng. Không đưa secret lên Git. PostgreSQL Docker local dùng cổng 5433.
4. Chạy `npx prisma migrate deploy`, sau đó `npm run catalog:import` để xem trước và `npm run catalog:import -- --apply` để thêm catalog còn thiếu. Script chỉ thêm Category/Product/Size/Topping; không ghi đè dữ liệu cũ, tạo User/Order/Payment hoặc cấp tồn kho.
5. Chạy Backend: `npm run start:dev` → `http://localhost:3001/api/health`.
6. Tại `apps/web`: `npm ci`; sao chép `.env.example` thành `.env.local` **chỉ nếu chưa có**. NEXT_PUBLIC_API_URL=http://localhost:3001. Chạy `npm run dev` → `http://localhost:3000`.

PowerShell có thể dùng `npm.cmd` / `npx.cmd` nếu execution policy chặn npm.ps1.

Catalog bàn giao có 25 Product, 50 Size và ảnh tương ứng. Database local không nằm trên GitHub: tài khoản/email OTP, session, Order/Payment và tồn kho của từng máy là riêng. Tồn của Size mới để NULL; ADMIN phải nhập tồn thực tế trước khi đặt món trên database của mình. Không dùng Product.stockQuantity legacy.

Đăng ký tài khoản thật, xác minh OTP rồi đăng nhập. Bootstrap ADMIN phải dùng quy trình được chủ cửa hàng phê duyệt tại [hướng dẫn triển khai](docs/deployment.md); không có mật khẩu/admin mặc định.

Theo Assignment 2 §5.1 và §7.1, luồng chính dùng **Ví/Thẻ mô phỏng**, không thu tiền thật. Tại `apps/api/.env`, đặt `ENABLE_MOCK_PAYMENTS=true`, `MOCK_PAYMENT_OUTCOME=SUCCESS`; khởi động lại API sau khi đổi cấu hình. Khách tạo đơn rồi chọn Ví/Thẻ mô phỏng tại chi tiết đơn. Backend xác nhận Payment `SUCCESS`, Order `PAID` và tiêu thụ tồn kho một lần. Dùng `FAILED` hoặc `UNKNOWN` để kiểm thử lỗi trên database test; khách không được tự gửi kết quả thanh toán. `UNKNOWN` không cho tạo payment mới khi chưa xác minh xong.

VNPay Sandbox giữ như tính năng mở rộng; giao diện ẩn mặc định. Muốn thử riêng, đặt `NEXT_PUBLIC_ENABLE_VNPAY_SANDBOX=true` trước khi build web (Docker: `--build-arg NEXT_PUBLIC_ENABLE_VNPAY_SANDBOX=true`) và cấu hình merchant/IPN hợp lệ. Không chuyển các giao dịch VNPay cũ sang mock. Cấu hình mẫu production demo bật mock; việc sửa file local không cập nhật AWS đang chạy. Xem [báo cáo Checkout/VNPay](docs/architecture/stage2-checkout-vnpay-report.md).

Kiểm tra: `npm run lint`, `npm test`, `npm run build` trong từng app; API có `npm run test:p2`, `npm run test:p3`, `npm run test:stage2` dùng database test riêng. Không chạy fixture vào database vận hành.

## Nhân viên và duyệt đơn

Nhân viên đăng nhập rồi vào **Tài khoản → Đơn cần phục vụ** (`/staff/orders`).
Chỉ đơn đã thanh toán mới vào hàng đợi, ưu tiên đơn cũ trước. Thao tác:
**Duyệt đơn và pha chế → Đánh dấu sẵn sàng → Xác nhận đã giao**.
Backend kiểm tra quyền STAFF, phiên bản đơn và thứ tự trạng thái; mỗi bước tạo
lịch sử/thông báo, chỉ COMPLETED mới cộng điểm một lần. Nhân viên không tự đổi
Payment thành SUCCESS và không tiếp nhận đơn chưa thanh toán.

Tạo tài khoản demo trên database local: tại `apps/api`, chạy
`node scripts/create-local-staff.cjs [email-demo]`. Script chỉ cho phép database
localhost, tạo STAFF mới với mật khẩu ngẫu nhiên và email đã xác minh cho demo;
không gửi email, không ghi mật khẩu vào source, không sửa tài khoản đã tồn tại.
Không dùng script này để cấp tài khoản production.


## Hoàn thiện delivery

Pipeline CD đã chuẩn bị tại `.github/workflows/cd.yml`; xem [cấu hình và rollback](deploy/CD-SETUP.md), [UML nguồn và bản xuất](docs/diagrams/README.md). Chưa có minh chứng CD chạy trên GitHub cho các thay đổi chưa commit này.


## Hướng dẫn bàn giao và vận hành

### 1. Repository và production

- Repository: https://github.com/brewlite/brewlite-monorepo
- Frontend: https://brewlite-sgu.duckdns.org/
- API Health: https://brewlite-sgu.duckdns.org/api/health
- API Products: https://brewlite-sgu.duckdns.org/api/products

### 2. Chạy hệ thống trên máy local

Yêu cầu Node.js 24, npm, Git và Docker Desktop.

Clone repository:

```powershell
git clone https://github.com/brewlite/brewlite-monorepo.git
cd brewlite-monorepo
```

Khởi động PostgreSQL:

```powershell
docker compose up -d postgres
```

Backend:

```powershell
cd apps/api
npm ci
```

Sao chép `.env.example` thành `.env` nếu chưa có,
sau đó cấu hình DATABASE_URL, JWT_SECRET và SMTP
phù hợp theo `docs/deployment.md`.

```powershell
npx prisma migrate deploy
npm run start:dev
```

Mở terminal khác để chạy Frontend:

```powershell
cd apps/web
npm ci
```

Sao chép `.env.example` thành `.env.local` nếu
chưa có và cấu hình NEXT_PUBLIC_API_URL.

```powershell
npm run dev
```

Truy cập:

- Frontend: http://localhost:3000
- API: http://localhost:3001/api/health

Không sử dụng dữ liệu hoặc tài khoản production
trong môi trường local.

### 3. Kiểm thử và build

Tại `apps/api`:

```powershell
npm run lint
npm test
npm run build
```

Tại `apps/web`:

```powershell
npm run lint
npm test
npm run build
```

Integration tests cần database kiểm thử riêng.
Không chạy test có thay đổi dữ liệu trên database
production.

### 4. Đóng gói Docker image

Tại thư mục gốc repository:

```powershell
$sha = (git rev-parse HEAD).Trim()

docker build --platform linux/amd64 `
  -t "brewlite-api:$sha" ./apps/api

docker build --platform linux/amd64 `
  --build-arg NEXT_PUBLIC_API_URL=https://brewlite-sgu.duckdns.org `
  --build-arg NEXT_PUBLIC_ENABLE_VNPAY_SANDBOX=false `
  -t "brewlite-web:$sha" ./apps/web
```

### 5. Quy trình deploy production

Workflow được khai báo tại:

`.github/workflows/cd.yml`

Trình tự:

CI → Docker Build → GHCR → Production Approval
→ EC2 Deploy → Health Check → Smoke Test.

Chỉ người được phân quyền mới thực hiện triển khai.

Trước khi deploy cần:

- Kiểm tra CI thành công.
- Xác nhận phiên bản và commit SHA.
- Kiểm tra secrets và quyền SSH của GitHub Actions.
- Kiểm tra quyền pull private image từ GHCR trên EC2.
- Kiểm tra database backup và kế hoạch migration.
- Có phê duyệt production.

Không kích hoạt release tag `v*` hoặc chạy CD thủ
công khi các điều kiện trên chưa được đáp ứng.

Hướng dẫn chi tiết: `deploy/CD-SETUP.md`.

### 6. Rollback

Khi triển khai thất bại mà chưa thực hiện migration,
script `deploy/release.sh` được thiết kế để khôi phục
Docker image ứng dụng trước đó.

Nếu migration đã bắt đầu, không tự động rollback
image cũ vì có thể gây bất tương thích database.

Cần kiểm tra log, backup và lập phương án khắc phục
được phê duyệt.

Không sử dụng `prisma migrate reset`,
`docker compose down -v` hoặc xóa database production.

### 7. Tài liệu bàn giao

- `README.md`: Hướng dẫn sử dụng repository.
- `docs/deployment.md`: Hướng dẫn vận hành.
- `deploy/CD-SETUP.md`: Cấu hình CD và rollback.
- `docs/delivery/RELEASE_NOTES_DRAFT.md`: Bản nháp Release Notes.

Lưu ý: CD production qua GitHub Actions chưa được
kiểm chứng bằng một lượt triển khai thực tế.
