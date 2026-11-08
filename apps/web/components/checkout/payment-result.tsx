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
  const [diagnostic, setDiagnostic] = useState<Payment['reconciliation']>();
  const [inquiring, setInquiring] = useState(false);
  const reasons: Record<string, string> = {
    CONFIGURATION_ERROR: 'Cấu hình đối soát chưa sẵn sàng. Vui lòng liên hệ cửa hàng.',
    NETWORK_ERROR: 'Chưa kết nối được máy chủ đối soát VNPay.', TIMEOUT: 'VNPay chưa phản hồi trong thời gian chờ.',
    HTTP_ERROR: 'Máy chủ đối soát trả lỗi HTTP.', INVALID_JSON: 'Phản hồi đối soát không đúng định dạng.', INVALID_RESPONSE: 'Dữ liệu đối soát chưa hợp lệ.',
    MISSING_SIGNATURE: 'Phản hồi đối soát thiếu chữ ký; chưa thể xác nhận thanh toán.', INVALID_SIGNATURE: 'Chữ ký đối soát không hợp lệ; chưa thể xác nhận thanh toán.',
    PROVIDER_ERROR: 'VNPay chưa trả được kết quả giao dịch hợp lệ.', MERCHANT_MISMATCH: 'Thông tin merchant trong kết quả không khớp.',
    REFERENCE_MISMATCH: 'Mã giao dịch trong kết quả không khớp.', AMOUNT_MISMATCH: 'Số tiền đối soát không khớp.',
    RATE_LIMITED: 'Vui lòng chờ trước khi yêu cầu đối soát lại.', ATTEMPT_LIMIT: 'Đã đạt giới hạn tra cứu. Vui lòng liên hệ cửa hàng.',
    VERIFIED: 'Đã xác minh phản hồi VNPay. Trạng thái thanh toán hiển thị theo kết quả Backend xử lý.',
  };
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
      {payment && ['PENDING', 'UNKNOWN'].includes(payment.status) && <button disabled={inquiring} onClick={async () => { setInquiring(true); try { const result = await sendStore<Payment>(`/payments/${payment.id}/reconcile`, {}); setPayment(result); setDiagnostic(result.reconciliation); setError(''); } catch (caught) { setError(authError(caught)); } finally { setInquiring(false); } }}>{inquiring ? 'Đang đối soát…' : 'Yêu cầu đối soát VNPay'}</button>}
      {diagnostic && <p role="status">{reasons[diagnostic.reason] ?? 'Chưa có kết quả đối soát được xác minh.'}{diagnostic.responseCode && ` Mã phản hồi ${diagnostic.signatureVerified ? 'đã xác minh' : 'chưa xác minh'}: ${diagnostic.responseCode}.`}{diagnostic.retryAfterSeconds ? ` Thử lại sau ${diagnostic.retryAfterSeconds} giây.` : ''}</p>}
    </>}
    <p><Link href="/orders">Lịch sử mua hàng</Link></p></div>;
}
