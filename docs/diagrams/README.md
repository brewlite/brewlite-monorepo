# UML hiện tại

Các bản nguồn và SVG cùng tên được sinh bằng PlantUML 1.2025.7, UTF-8:

- activity-checkout: luồng end-to-end, auth, tồn, lỗi, retry và UNKNOWN.
- sequence-checkout: HTTP/JWT, transaction, mock adapter và idempotency.
- class-domain: domain từ Prisma; Size.onHand thay cho stock legacy.
- deployment-aws: Caddy/Next/Nest/Postgres trên EC2 và pipeline CD đã chuẩn bị.

ClassDiagram.png cũ được giữ để đối chiếu; class-domain.puml/svg là bản domain cập nhật. Pipeline GHCR/CD trong deployment diagram được ghi rõ chưa có run nghiệm thu, không phải minh chứng đã deploy tự động.

Tái xuất: `java -jar <plantuml-1.2025.7.jar> -charset UTF-8 -tsvg docs/diagrams/*.puml`.

Nhánh hủy PAID đã có cho mock wallet/card trước pha chế. VNPay refund chưa triển khai; không coi Refund UNKNOWN là hoàn tiền thành công.
