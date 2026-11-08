"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readPayment, type Payment } from '../../services/payment.service';
import { authError } from '../../services/auth.service';
import { sendStore } from '../../services/store.service';
export function PaymentResult({ paymentId }: { paymentId: string | null }) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!paymentId) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await readPayment(paymentId);
        if (!active) return;
        setPayment(next); setError('');
        if (next.status === 'PENDING' || next.status === 'UNKNOWN') timer = setTimeout(() => void load(), 5000);
      } catch (caught) { if (active) setError(authError(caught)); }
    };
    void load(); return () => { active = false; clearTimeout(timer); };
  }, [paymentId, attempt]);
  const labels = { SUCCESS: 'Thanh toán thành công', FAILED: 'Thanh toán thất bại', PENDING: 'Đang chờ VNPay xác nhận', UNKNOWN: 'Kết quả thanh toán chưa xác định — đang chờ đối soát' };
  return <div className="store-workspace"><h1>Kết quả thanh toán Sandbox</h1>
    {!paymentId ? <p role="alert">Không xác minh được đường dẫn trả về. Vui lòng kiểm tra trạng thái trong lịch sử đơn hàng.</p> : <>
      <p role="status">{payment ? labels[payment.status] : 'Đang kiểm tra kết quả với Backend…'}</p>
      {error && <p role="alert">{error} <button onClick={() => setAttempt((value) => value + 1)}>Thử lại</button></p>}
      {payment && <Link href={`/orders/${payment.orderId}`}>Xem chi tiết đơn</Link>}
      {payment && ['PENDING', 'UNKNOWN'].includes(payment.status) && <p>Chưa có xác nhận thành công từ Backend. Không thanh toán lại trong khi giao dịch đang được xác minh.</p>}
      {payment && ['PENDING', 'UNKNOWN'].includes(payment.status) && <button onClick={async () => { try { setPayment(await sendStore<Payment>(`/payments/${payment.id}/reconcile`, {})); setError(''); } catch (caught) { setError(authError(caught)); } }}>Yêu cầu đối soát VNPay</button>}
    </>}
    <p><Link href="/orders">Lịch sử mua hàng</Link></p></div>;
}
