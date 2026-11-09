# Hủy PAID và hoàn tiền mô phỏng — 2026-11-09

## Kết quả

Triển khai nhánh Assignment 1 PAID -> CANCELLED cho mock wallet/card trước pha chế. Không thay đổi giao dịch vận hành, không gọi VNPay refund, không commit/push/deploy.

### Backend

- Refund riêng: Payment gốc vẫn SUCCESS. Full refund amount bằng Payment.amount; unique paymentId/providerRefundId/idempotencyKey; requestedBy và timestamps để truy vết.
- Order.cancel nhận expectedVersion, bắt buộc cho PAID, cùng Idempotency-Key. Giữ tương thích hủy unpaid không gửi version.
- Hủy và STAFF nhận pha chế khóa cùng Order, chạy trong transaction serializable/retry. Chỉ một thao tác thắng; PREPARING/READY/COMPLETED bị chặn.
- Hoàn Size.onHand đúng snapshot quantity; không giảm reserved lần nữa. Reservation CONSUMED vẫn là lịch sử tiêu thụ gốc, Refund ghi nhận bù trừ.
- Coupon usedCount giảm một lần có guard >=1; không bật mã hết hạn/vô hiệu hóa.
- REFUND hoàn REDEEM; EARN_REVERSAL thu hồi đúng EARN ledger. Không âm điểm hoặc xâm phạm reservedPoints. Nếu thiếu ledger hoặc điểm đã tiêu/giữ không đủ bù: 409 cần đối soát, không ghi Refund/không hủy.
- VNPay: EXTERNAL_REFUND_UNSUPPORTED, không giả đã hoàn tiền. Partial refund và adapter external REQUESTED/PENDING/UNKNOWN chưa triển khai.

### Frontend

- Nút hủy PAID mock mở native dialog, ghi rõ hoàn tiền mô phỏng và hậu quả; xác nhận mới gửi version.
- Dialog dùng portal ra body để không bị zoom của panel đơn làm cắt trên mobile; nút giữ đơn trắng viền đen, nút hủy nền đen.
- Order detail/payment result chỉ nói đã hoàn tiền khi Backend trả Refund MOCK SUCCESS; Payment SUCCESS gốc vẫn được hiển thị đúng.
- Lịch sử điểm có nhãn EARN_REVERSAL tiếng Việt.

## File chính

- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20261109040000_mock_paid_cancellation/migration.sql
- apps/api/src/commerce/commerce.service.ts và commerce.controller.ts
- apps/api/src/inventory/inventory.service.ts
- apps/api/test/stage2-checkout.e2e-spec.ts
- apps/web/services/store.service.ts và payment.service.ts
- apps/web/components/orders/customer-orders.tsx/css
- apps/web/components/checkout/payment-result.tsx
- apps/web/app/account/page.tsx
- apps/web/tests/orders-view.test.tsx và payment-result.test.tsx
- tests/p3-browser.cjs
- SRS, product policy, API/state machine, acceptance cases, traceability và UML source/SVG liên quan

## Kiểm thử đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Backend lint/build | Passed |
| Backend unit | 71 passed |
| Stage2 HTTP + real browser E2E | 49 passed, không skipped |
| Auth/commerce integration | 22 passed; các phase tùy chọn của runner được tách riêng |
| P2 inventory regression | 9 passed |
| Frontend full tests | 157 passed |
| Frontend lint/build | Passed |
| UI liên quan sau sửa portal | 29 passed |
| Desktop/mobile | native dialog và refund result đã kiểm tra ảnh; không cắt/tràn |
| Runtime/hydration | 0 exceptions; 56 request tới Backend test thực |
| git diff --check | Passed |

Case quan trọng: cùng key replay, hủy đồng thời khác key, STAFF/cancel race, stale version, ownership, thiếu điểm/điểm đang giữ, lỗi sau khi đã ghi tồn phải rollback, coupon tắt/hết hạn không bật lại, VNPay bị chặn, trạng thái đang pha chế trở đi bị chặn. Log 500 'Controlled failure after inventory write' là lỗi được test chủ động chèn để chứng minh rollback, không phải lỗi còn tồn tại của happy path.

Database cuối cho E2E: brewlite_stage2_test_1794191711265, PostgreSQL test localhost:55439; auth schema brewlite_auth_test_1794191752620 trong brewlite_test_control; P2 brewlite_p2_test_1794191781907. Fixture chỉ ở test DB, không reset/drop/seed. HTTP benchmark kèm suite đạt p95 14.4ms tại local, không phải chứng nhận hiệu năng AWS.

## Ranh giới vận hành

Migration mới chỉ áp dụng ở database test. Local operating brewlite_db vẫn có 25 sản phẩm bật bán, 50 Size.onHand=30; Refund migration chưa áp dụng. Không thay đổi env, AGENTS.md, stash, tài khoản hoặc giao dịch vận hành. Web E2E cổng 3100 đã dừng; Backend vận hành không khởi chạy.

Trước khi dùng tính năng trên operating local/AWS phải review/apply migration mới cùng release đã kiểm tra. Không backfill EARN cho đơn cũ hoặc tự hoàn đơn legacy; thiếu ledger trả lỗi cần đối soát. Không đánh dấu hoàn thành CD thực tế hay toàn bộ assignment từ kết quả code local này.
