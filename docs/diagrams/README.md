# Bộ Sơ Đồ UML — BrewLite (Assignment 2)

Toàn bộ sơ đồ được rà soát khớp trực tiếp với mã nguồn thực tế (`apps/api`, `apps/web`, `apps/api/prisma/schema.prisma`, `compose.prod.yml`, `deploy/Caddyfile`, `.github/workflows/ci.yml`, `.github/workflows/cd.yml`) và xuất đồng bộ cả tệp nguồn `.puml` lẫn tệp ảnh `.svg` (UTF-8):

| Mục Assignment 2 | Tệp nguồn PlantUML | Tệp SVG xuất sẵn | Nội dung chính |
| --- | --- | --- | --- |
| Task 1.2 — Use-Case tổng quan | `usecase-overview.puml` | `usecase-overview.svg` | Toàn bộ tác nhân (`Guest/CUSTOMER`, `STAFF`, `ADMIN`, `Mock/VNPay`, `Gmail SMTP`) và Use-Case từ thực đơn (ẩn món chưa nhập tồn), đặt online, đặt tại quầy (POS + CashShift), pha chế đến quản trị & đối soát tiền mặt. |
| Task 1.3 — Use-Case trọng tâm | `usecase-checkout.puml` | `usecase-checkout.svg` | Trọng tâm **Đặt và thanh toán đơn hàng** với đầy đủ quan hệ `<<include>>` / `<<extend>>` cho cả luồng online và đặt tại quầy (mã giảm giá, điểm thưởng, retry, đối soát UNKNOWN, hủy/hoàn tiền, thu tiền mặt). |
| Task 2.1 — Sơ đồ hoạt động | `activity-checkout.puml` | `activity-checkout.svg` | Luồng đầu-cuối theo swimlane: tải thực đơn (lọc tồn chưa nhập), cấu hình & giỏ (Guest / DB / Giỏ POS), đăng nhập OTP, giữ tồn `SERIALIZABLE`, thanh toán Tiền mặt / Mock / VNPay, xử lý `FAILED` / `Retry` / `UNKNOWN`, hủy `PAID` trước pha chế và hàng đợi pha chế. |
| Task 2.2 — Sơ đồ tuần tự | `sequence-checkout.puml` | `sequence-checkout.svg` | Lifelines `Customer → Next.js UI → NestJS API → PostgreSQL → Payment Service`: JWT/Origin guards, `/cart/calculate`, `SERIALIZABLE` transaction giữ tài nguyên, `alt` cho `SUCCESS`/`FAILED`/`UNKNOWN`, `Idempotency-Key`, hủy `PAID` hoàn tiền và thông báo. |
| Task 2.3 — Sơ đồ lớp miền nghiệp vụ | `class-domain.puml` | `class-domain.svg` | Toàn bộ thực thể miền theo `schema.prisma` (`User`, `Category`, `Product`, `Size`, `Topping`, `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderReservation`, `OrderStatusHistory`, `Payment`, `PaymentEvent`, `Refund`, `CashShift`, `Promotion`, `LoyaltyTransaction`, `Notification`, `IdempotencyRecord`) cùng enum & bội số. |
| Task 3.2 — Sơ đồ triển khai | `deployment-aws.puml` | `deployment-aws.svg` | Kiến trúc triển khai Production trên AWS EC2 (`Caddy :80/:443` + `Next.js :3000` + `NestJS :3001` + `PostgreSQL 16` + volume `postgres_data` + `uploads/` + `deploy/.env.production`), tách biệt ranh giới Local Dev / CI-CD (`ci.yml`, `cd.yml`, GHCR) / Production và dịch vụ ngoài (Gmail SMTP, VNPay Sandbox). |

> Ghi chú: `ClassDiagram.png` cũ được giữ lại làm bản tham chiếu lịch sử; `class-domain.puml` / `class-domain.svg` là sơ đồ miền cập nhật chính thức.
>
> Tái xuất SVG cục bộ (khi có Java + PlantUML): `java -jar <plantuml.jar> -charset UTF-8 -tsvg docs/diagrams/*.puml`.
