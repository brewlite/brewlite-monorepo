import { Suspense } from 'react';
import { SiteFrame } from '../../../components/layout/site-frame';
import { PaymentResult } from '../../../components/checkout/payment-result';
async function Result({ searchParams }: { searchParams: Promise<{ paymentId?: string }> }) {
  const params = await searchParams;
  return <PaymentResult paymentId={typeof params.paymentId === 'string' && /^[a-f0-9-]{36}$/i.test(params.paymentId) ? params.paymentId : null} />;
}
export default function Page({ searchParams }: { searchParams: Promise<{ paymentId?: string }> }) {
  return <SiteFrame><section className="section"><div className="container"><Suspense fallback={<p>Đang kiểm tra thanh toán…</p>}><Result searchParams={searchParams} /></Suspense></div></section></SiteFrame>;
}
