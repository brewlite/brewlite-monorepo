"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readPayment, type Payment } from '../../services/payment.service';
import { authError } from '../../services/auth.service';
import { getStore, sendStore, type Order } from '../../services/store.service';
import { formatPrice } from '../../lib/format-price';
import './payment-result.css';
export function PaymentResult({ paymentId }: { paymentId: string | null }) {
  const [loadedPayment, setPayment] = useState<Payment | null>(null);
  const payment = loadedPayment?.id === paymentId ? loadedPayment : null;
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [diagnostic, setDiagnostic] = useState<Payment['reconciliation']>();
  const [inquiring, setInquiring] = useState(false);
  const [details, setDetails] = useState<{ paymentId: string; code: string; retryReason: string } | null>(null);
  const currentDetails = details?.paymentId === payment?.id ? details : null;
  const orderCode = currentDetails?.code ?? '';
  const canRetry = !!currentDetails && currentDetails.retryReason === '';
  const reasons: Record<string, string> = {
    CONFIGURATION_ERROR: 'Cấu hình đối soát chưa sẵn sàng. Vui lòng liên hệ cửa hàng.',
    NETWORK_ERROR: 'Chưa kết nối được máy chủ đối soát VNPay.', TIMEOUT: 'VNPay chưa phản hồi trong thời gian chờ.',
    HTTP_ERROR: 'Máy chủ đối soát trả lỗi HTTP.', INVALID_JSON: 'Phản hồi đối soát không đúng định dạng.', INVALID_RESPONSE: 'Dữ liệu đối soát chưa hợp lệ.',
    MISSING_SIGNATURE: 'Phản hồi đối soát thiếu chữ ký; chưa thể xác nhận thanh toán.', INVALID_SIGNATURE: 'Chữ ký đối soát không hợp lệ; chưa thể xác nhận thanh toán.',
    PROVIDER_ERROR: 'VNPay chưa trả được kết quả giao dịch hợp lệ.', MERCHANT_MISMATCH: 'Thông tin merchant trong kết quả không khớp.',
    REFERENCE_MISMATCH: 'Mã giao dịch trong kết quả không khớp.', AMOUNT_MISMATCH: 'Số tiền đối soát không khớp.',
    INVALID_COMMAND: 'Loại lệnh đối soát trong phản hồi không hợp lệ.', INVALID_TRANSACTION_TYPE: 'Loại giao dịch đối soát không khớp giao dịch thanh toán.',
    MISSING_RESPONSE_ID: 'Phản hồi đối soát thiếu mã định danh từ VNPay.', NO_VERIFIED_RESULT: 'Chưa có kết quả đối soát được xác minh từ VNPay.',
    RATE_LIMITED: 'Vui lòng chờ trước khi yêu cầu đối soát lại.', ATTEMPT_LIMIT: 'Đã đạt giới hạn tra cứu. Vui lòng liên hệ cửa hàng.',
    VERIFIED: 'Đã xác minh phản hồi VNPay. Trạng thái thanh toán hiển thị theo kết quả Backend xử lý.',
  };
  useEffect(() => {
    if (!paymentId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    let settled = false;
    const load = async (initial = false) => {
      if (!active || inFlight || settled) return;
      clearTimeout(timer);
      if (!initial && document.hidden) return;
      inFlight = true;
      try {
        const next = await readPayment(paymentId);
        if (!active) return;
        setPayment(next); setError('');
        settled = next.status === 'SUCCESS' || next.status === 'FAILED';
        if (next.status === 'SUCCESS') window.dispatchEvent(new Event('brewlite:cart-updated'));
        if (!settled && !document.hidden) timer = setTimeout(() => void load(), 15000);
      } catch (caught) { if (active) setError(authError(caught)); }
      finally { inFlight = false; }
    };
    const resume = () => { if (!document.hidden && !settled) void load(); };
    void load(true);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [paymentId, attempt]);
  useEffect(() => {
    if (!payment?.orderId) return;
    let active = true;
    let expiryTimer: ReturnType<typeof setTimeout>;
    const loadOrder = async () => {
      try {
        const order = await getStore<Order>(`/orders/${encodeURIComponent(payment.orderId)}`);
        if (!active) return;
        const deadline = order?.expiresAt ? Date.parse(order.expiresAt) : 0;
        const attempts = order?.payments ?? [];
        const retryReason = !['PENDING', 'PAYMENT_FAILED'].includes(order?.status ?? '') ? 'Đơn không còn chờ thanh toán. Vui lòng xem chi tiết đơn.'
          : !deadline || deadline <= Date.now() ? 'Đơn đã hết hạn thanh toán. Vui lòng đặt đơn mới.'
          : attempts.some((p) => ['PENDING', 'UNKNOWN'].includes(p.status)) ? 'Một giao dịch khác đang được xác minh. Không thanh toán lại.'
          : attempts.length >= 3 ? 'Đã hết 3 lần thanh toán cho đơn này. Vui lòng đặt đơn mới.' : '';
        setDetails({ paymentId: payment.id, code: order?.orderCode ?? '', retryReason });
        if (payment.status === 'FAILED' && !retryReason) expiryTimer = setTimeout(() => {
          if (active) setDetails({ paymentId: payment.id, code: order.orderCode, retryReason: 'Đơn đã hết hạn thanh toán. Vui lòng đặt đơn mới.' });
        }, Math.min(deadline - Date.now(), 2147483647));
      } catch { if (active) setDetails({ paymentId: payment.id, code: '', retryReason: 'Chưa xác minh được điều kiện thử lại. Vui lòng xem chi tiết đơn.' }); }
    };
    void loadOrder(); return () => { active = false; clearTimeout(expiryTimer); };
  }, [payment?.orderId, payment?.id, payment?.status, attempt]);
  const labels = { SUCCESS: 'Thanh toán thành công', FAILED: 'Thanh toán thất bại', PENDING: 'Đang chờ xác nhận thanh toán', UNKNOWN: 'Kết quả thanh toán chưa xác định — đang chờ đối soát' };
  const statusLabels = { SUCCESS: 'Đã thanh toán', FAILED: 'Thất bại', PENDING: 'Đang chờ', UNKNOWN: 'Đang xác minh' };
  const success = payment?.status === 'SUCCESS';
  const refunded = payment?.refund?.provider === 'MOCK' && payment.refund.status === 'SUCCESS';
  const failed = payment?.status === 'FAILED';
  const method = payment?.providerPaymentId?.startsWith('vnpay:') ? 'VNPay Sandbox' : payment?.method === 'WALLET' ? 'Ví mô phỏng' : payment?.method === 'CARD' ? 'Thẻ mô phỏng' : '—';
  return <div className={`payment-outcome ${success ? 'po-success' : failed ? 'po-failed' : 'po-pending'}`}><article className="po-card">
    <div className="po-symbol" aria-hidden="true"><svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{success ? <path d="m6 12 4 4 8-9"/> : failed ? <path d="m7 7 10 10M17 7 7 17"/> : <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>}</svg></div>
    <h1 role="status">{paymentId ? payment ? refunded ? 'Đã hoàn tiền mô phỏng' : labels[payment.status] : 'Đang kiểm tra thanh toán…' : 'Không xác minh được thanh toán'}</h1>
    {success && !refunded && <p className="po-subtitle">Cảm ơn bạn! Đơn hàng đã được ghi nhận.</p>}
    {refunded && <p className="po-subtitle">Giao dịch gốc đã thành công; khoản hoàn tiền mô phỏng đã được Backend xác nhận. Không chuyển tiền thật.</p>}
    {failed && <p className="po-subtitle">Giao dịch chưa hoàn tất.</p>}
    {!paymentId ? <p role="alert">Không xác minh được đường dẫn trả về. Vui lòng kiểm tra trạng thái trong lịch sử đơn hàng.</p> : <>
      {error && <p role="alert">{error} <button onClick={() => setAttempt((value) => value + 1)}>Thử lại</button></p>}
      {payment && <><dl className="po-summary"><div><dt>Mã đơn</dt><dd>{orderCode || payment.orderId}</dd></div><div><dt>Phương thức</dt><dd>{method}</dd></div><div><dt>Trạng thái</dt><dd className="po-status">{statusLabels[payment.status]}</dd></div><div className="po-amount"><dt>Số tiền</dt><dd>{formatPrice(payment.amount)}đ</dd></div></dl>{failed && !canRetry && <p role="status">{currentDetails?.retryReason ?? 'Đang kiểm tra điều kiện thanh toán lại…'}</p>}<div className="po-actions">{failed && canRetry && <Link className="po-primary" href={`/orders/${payment.orderId}`}>Thử lại thanh toán</Link>}<Link className={failed && canRetry ? 'po-secondary' : 'po-primary'} href={`/orders/${payment.orderId}`}>Xem chi tiết đơn</Link>{success && <Link className="po-secondary" href="/menu">Về thực đơn</Link>}</div></>}
      {payment && ['PENDING', 'UNKNOWN'].includes(payment.status) && <p>Chưa có xác nhận thành công từ Backend. Không thanh toán lại trong khi giao dịch đang được xác minh.</p>}
      {payment?.providerPaymentId?.startsWith('vnpay:') && ['PENDING', 'UNKNOWN'].includes(payment.status) && <button disabled={inquiring} onClick={async () => { setInquiring(true); try { const result = await sendStore<Payment>(`/payments/${payment.id}/reconcile`, {}); setPayment(result); setDiagnostic(result.reconciliation); setError(''); if (result.status === 'SUCCESS') window.dispatchEvent(new Event('brewlite:cart-updated')); } catch (caught) { setError(authError(caught)); } finally { setInquiring(false); } }}>{inquiring ? 'Đang đối soát…' : 'Yêu cầu đối soát VNPay'}</button>}
      {diagnostic && <p role="status">{reasons[diagnostic.reason] ?? 'Chưa có kết quả đối soát được xác minh.'}{diagnostic.responseCode && ` Mã phản hồi ${diagnostic.signatureVerified ? 'đã xác minh' : 'chưa xác minh'}: ${diagnostic.responseCode}.`}{diagnostic.retryAfterSeconds ? ` Thử lại sau ${diagnostic.retryAfterSeconds} giây.` : ''}</p>}
    </>}
    {!success && !failed && <p className="po-history"><Link href="/orders">Lịch sử mua hàng</Link></p>}</article></div>;
}
