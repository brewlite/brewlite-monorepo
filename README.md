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

VNPay chỉ Sandbox, cần merchant và IPN HTTPS riêng; chưa có credentials thì phần thanh toán báo chưa cấu hình. Mock bị tắt mặc định. Xem [báo cáo Checkout/VNPay](docs/architecture/stage2-checkout-vnpay-report.md) và các điểm chưa nghiệm thu trước khi sử dụng gateway thực tế.

Kiểm tra: `npm run lint`, `npm test`, `npm run build` trong từng app; API có `npm run test:p2`, `npm run test:p3`, `npm run test:stage2` dùng database test riêng. Không chạy fixture vào database vận hành.
