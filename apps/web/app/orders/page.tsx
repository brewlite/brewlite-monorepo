import type { Metadata } from "next";
import { SiteFrame } from "../../components/layout/site-frame";
import { OrdersView } from "../../components/orders/orders-view";
export const metadata: Metadata = {
  title: "Lịch sử đơn hàng | BrewLite",
  description: "Xem và theo dõi lịch sử đơn hàng BrewLite",
};
export default function OrdersPage() {
  return (
    <SiteFrame>
      <section className="section orders-page">
        <div className="container">
          <OrdersView />
        </div>
      </section>
    </SiteFrame>
  );
}
