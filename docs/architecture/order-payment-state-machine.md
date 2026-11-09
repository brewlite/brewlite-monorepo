# Order, pricing và payment state machine

Target P4–P7; không phải bằng chứng source đã có module đặt hàng. Size.id là SKU, không có ProductSKU. [API](api-contract.md), [DB](database-baseline.md).

## Giá chuẩn

Tất cả dùng Decimal với số đồng nguyên; không tính tiền bằng floating-point Number. API serialize chuỗi số nguyên.

```
subtotal = SUM((basePrice + sizeExtra + SUM(toppingPrice)) * quantity)
couponRaw = fixedAmount OR floor(subtotal * percent / 100)
couponDiscount = min(couponRaw, configuredMaxDiscount nếu có, floor(subtotal * 0.50))
afterCoupon = subtotal - couponDiscount
maxPoints = min(balancePoints - reservedPoints, floor(floor(afterCoupon * 0.20) / 100))
redeemValue = pointsUsed * 100
payable = afterCoupon - redeemValue
earnedPoints = floor(payable / 10000), chỉ khi PAID
```

Một coupon; percent 1..50 theo policy. Từ chối pointsUsed vượt balance/cap thay vì âm thầm đổi số điểm. Coupon kiểm tra active, thời gian, min spend, quota dùng+giữ và giới hạn khách. Discount không làm tăng tổng hoặc tạo order payable=0 khi subtotal>0. Mọi validation lại ở tạo Order; quote không reserve.

## Order transitions

| From | To | Actor/điều kiện | Side effect transaction |
| --- | --- | --- | --- |
| Không có | PENDING | CUSTOMER, cart/giá/stock/quota/điểm hợp lệ | snapshot + giữ tài nguyên + expiresAt=createdAt+10m + history |
| PENDING | PAID | Backend xác minh SUCCESS mock đúng amount/order/payment | consume reservation một lần; tồn/điểm/coupon cập nhật cùng transaction |
| PENDING | CANCELLED | CUSTOMER hoặc SYSTEM; không paid, không unresolved UNKNOWN; xử lý race với attempt đang chạy | release HELD một lần, ghi history |
| PENDING | PAYMENT_FAILED | Backend xác minh FAILED | giữ giỏ và tài nguyên trong TTL, không cộng điểm |
| PAYMENT_FAILED | PENDING | CUSTOMER retry trong TTL, không có attempt chưa xác minh | tạo attempt mới, giữ idempotency |
| PAYMENT_FAILED | CANCELLED | CUSTOMER hoặc SYSTEM, không unresolved | release tài nguyên đúng một lần |
| PAID | PREPARING | STAFF, expectedVersion hợp lệ | tăng version + history actor/time |
| PREPARING | READY | STAFF | tăng version + history, notification |
| READY | COMPLETED | STAFF | history; không cộng lại điểm đã ghi tại PAID |
| COMPLETED/CANCELLED | Không chuyển | Terminal | không hồi sinh |

ADMIN chỉ giám sát; CUSTOMER không set PAID/COMPLETED. Nhảy/lùi trạng thái trả 409. PAID có thể hủy bằng mock refund trước PREPARING; không hỗ trợ hoàn tiền VNPay trực tuyến.

## Payment attempts

Giữ enum hiện hữu PENDING/SUCCESS/FAILED, thêm UNKNOWN. SRS INITIATED ánh xạ PENDING, SUCCEEDED ánh xạ SUCCESS. Một Order có 0..n attempts nhưng tối đa 3 được tạo trong TTL.

```
PENDING -> SUCCESS | FAILED | UNKNOWN
UNKNOWN -> SUCCESS | FAILED (chỉ sau status inquiry/event đã xác minh)
FAILED -> attempt mới với key mới, không sửa attempt cũ thành PENDING
```

Retry mạng cùng attempt giữ key cũ; retry nghiệp vụ sau FAILED tạo key mới. Không tạo attempt mới khi còn PENDING đang xử lý hoặc UNKNOWN. Trước gửi gateway phải commit attempt/reservation; không giữ DB transaction khi chờ mạng. Worker đối soát PENDING quá hạn mạng thành UNKNOWN, không kết luận FAILED chỉ vì timeout.

## Reservation và transaction boundaries

OrderReservation state HELD→CONSUMED hoặc HELD→RELEASED, hai trạng thái cuối không chuyển lại. Quantity theo từng Size lấy từ OrderItem snapshot, gộp cùng Size trước reserve. Khi onHand NULL luôn từ chối tạo order; không diễn giải là 0/vô hạn.

- Tạo order: idempotency + transaction validate cartVersion, User availablePoints, Promotion quota, các Size active/available; khóa/cập nhật có điều kiện; tạo snapshot/HELD/expiry/history. Lỗi bất kỳ rollback hết, không còn order mồ côi.
- SUCCESS: khóa Order/Payment/reservation; verify provider IDs, amount và trạng thái; HELD→CONSUMED conditional; Size.onHand -= qty, Size.reserved -= qty; User.loyaltyPoints -= points, reservedPoints -= points; Promotion.usedCount +=1, reservedCount -=1; REDEEM ledger và PAID/history/event trong cùng commit.
- FAILED: không consume; giữ HELD đến cancel/expiry để retry đúng giới hạn.
- Cancel/expiry: chỉ HELD→RELEASED thắng mới giảm reserved counters; không trừ onHand/balance/usedCount. Worker chạy lại no-op.
- PAID: chỉ settlement SUCCESS hợp lệ mới tạo EARN ledger, tăng điểm; unique(orderId,type) là hàng rào bổ sung.

Dùng serializable transaction hoặc row lock + conditional update có kiểm chứng. Quy định thứ tự khóa thống nhất giữa các service, khóa Size theo ID đã sort, retry serialization/deadlock có giới hạn; không chỉ if-check rồi update rời rạc.

## Idempotency, history và callback

Idempotency unique(actorId,operation,key), hash canonical payload gồm các trường có nghĩa. Same key+same payload trả cùng resource/kết quả; khác payload 409. Tạo record và resource/side effect trong transaction tương ứng. Giữ record tối thiểu 24 giờ; IN_PROGRESS phải có recovery, không tạo duplicate khi timeout. Không cache raw JWT/password/OTP.

PaymentEvent providerEventId unique; duplicate event no-op. Nguồn callback là mock adapter nội bộ hoặc endpoint có chữ ký/secret riêng; không public nút SUCCESS. Mock scenario được cấu hình bằng test fixture, không cho customer gửi outcome tùy ý. Kiểm tra eventId/paymentId/orderId/amount, callback out-of-order không ghi đè SUCCESS thành FAILED.

History lưu from/to/actor/time/orderVersion; SYSTEM có actorType SYSTEM, không tạo User giả. Notification eventKey và ledger unique bảo vệ chạy lại.

## Hết hạn và UNKNOWN

Sau 10 phút không tạo attempt mới. Chỉ cancel/release khi đã xác nhận không có payment success hay attempt chưa rõ. UNKNOWN/PENDING chưa giải quyết phải inquiry trước; không giải phóng mù quáng. Reconciliation retry có giới hạn và cảnh báo vận hành; chưa biết thì vẫn giữ trạng thái rõ ràng cho khách. Late SUCCESS sau CANCELLED ghi PaymentEvent cần xử lý, không tự chuyển Order PAID hay trừ kho hồi tố.

## Tests bắt buộc

Hai khách tranh 1 Size cuối; nhiều line cùng Size; cùng coupon quota cuối; hai request dùng cùng điểm; idempotency cùng/khác payload; price/cart changed; worker release chạy lại; callback trùng/đảo thứ tự; tối đa 3 attempts; FAILED retry; UNKNOWN chặn retry/cancel; late SUCCESS; STAFF nhảy trạng thái/ADMIN update bị chặn; COMPLETED lặp không EARN hai lần. Seed records không thay thế các tests này.

## Assignment alignment — 2026-11-09

Assignment 1 là tiêu chí cụ thể cho MVP kế thừa bởi Assignment 2. Tạo đơn PENDING; thanh toán thất bại đã xác minh chuyển PAYMENT_FAILED và giữ giỏ/reservation trong TTL. Retry hợp lệ chuyển PENDING, thành công chuyển PAID. UNKNOWN không được coi là FAILED, không retry khi chưa xác minh. EARN ghi đúng một lần tại PAID, không cộng thêm ở COMPLETED. Giỏ chỉ được dọn sau SUCCESS và chỉ khi version còn khớp snapshot checkout; thay đổi mới của khách được giữ nguyên. Header có badge số lượng. API bổ sung GET /api/orders/me và POST /api/payments {orderId, method}; các route hiện hữu vẫn hoạt động.


## Hủy PAID và hoàn tiền mô phỏng — 2026-11-09

Theo nhánh PAID -> CANCELLED của Assignment 1, CUSTOMER được hủy đơn của mình trước PREPARING. POST /api/orders/:id/cancel nhận {expectedVersion} và Idempotency-Key; version bắt buộc cho PAID. PENDING/PAYMENT_FAILED tiếp tục release HELD; chặn attempt PENDING/UNKNOWN. PREPARING/READY/COMPLETED không hủy.

Mock full refund thực hiện trong một transaction serializable, khóa Order dùng chung với STAFF nhận pha chế: Refund(provider=MOCK,status=SUCCESS,amount=Payment.amount), Order CANCELLED và history actor/version; Payment gốc vẫn SUCCESS. Một Refund duy nhất cho mỗi Payment và khóa idempotency ngăn hoàn trùng. Hoàn onHand theo snapshot quantity, không sửa reserved lần nữa; reservation CONSUMED được giữ làm lịch sử tiêu thụ gốc. Coupon usedCount giảm một lần, không âm, không bật lại mã. REFUND hoàn đúng điểm REDEEM; EARN_REVERSAL thu hồi đúng EARN ledger, không tính lại bằng giá hiện tại.

Nếu thiếu ledger hoặc số dư sau hoàn/thu hồi thấp hơn reservedPoints: lỗi LOYALTY_RECONCILIATION_REQUIRED, không ghi Refund hoặc thay đổi tài nguyên. Không làm điểm âm, không đụng đến điểm đang giữ ở đơn khác. Nếu bước nào lỗi, rollback cả Refund, stock, coupon, ledger và Order. Khách nhận thông báo liên hệ cửa hàng để đối soát.

VNPay bị chặn bằng EXTERNAL_REFUND_UNSUPPORTED, không gửi yêu cầu refund ngoài hệ thống, không giả Refund SUCCESS. Các trạng thái Refund REQUESTED/PENDING/FAILED/UNKNOWN là khả năng mô hình, chưa phải adapter gateway đã triển khai. Hoàn tiền ở đây là mô phỏng, không có tiền thật.
