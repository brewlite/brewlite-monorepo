import { SiteFrame } from "../../../components/layout/site-frame";
import { OrdersView } from "../../../components/orders/orders-view";
export default function StaffPage() {
  return (
    <SiteFrame>
      <section className="section staff-board-page">
        <div className="container">
          <OrdersView staff />
        </div>
      </section>
    </SiteFrame>
  );
}
