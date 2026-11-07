import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

export const VNPAY_SANDBOX = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
export type VNParams = Record<string, string>;
const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');
export function vnCanonical(params: VNParams) {
  return Object.keys(params).filter((key) => key.startsWith('vnp_') && !['vnp_SecureHash', 'vnp_SecureHashType'].includes(key)).sort().map((key) => `${encode(key)}=${encode(params[key])}`).join('&');
}
export function vnSignature(params: VNParams, secret: string) {
  return createHmac('sha512', secret).update(vnCanonical(params), 'utf8').digest('hex');
}
export function vnDate(date: Date) {
  return new Date(date.getTime() + 7 * 3600000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}
@Injectable()
export class VNPayService {
  config() {
    const tmnCode = process.env.VNPAY_TMN_CODE?.trim();
    const secret = process.env.VNPAY_HASH_SECRET;
    const returnUrl = process.env.VNPAY_RETURN_URL?.trim();
    if (!tmnCode || !secret || !returnUrl) throw new ServiceUnavailableException({ code: 'VNPAY_NOT_CONFIGURED', message: 'VNPay Sandbox chưa được cấu hình merchant và Return URL.' });
    if (!/^[a-z0-9]{8}$/i.test(tmnCode)) throw new ServiceUnavailableException('Mã merchant VNPay phải gồm 8 ký tự chữ/số.');
    const parsed = new URL(returnUrl);
    if (!['https:', 'http:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) || parsed.username || parsed.password || parsed.hash || parsed.search) throw new ServiceUnavailableException('Return URL VNPay không hợp lệ.');
    return { tmnCode, secret, returnUrl };
  }
  url(ref: string, amount: string, createdAt: Date, expiresAt: Date, clientIp: string) {
    const config = this.config();
    if (!/^[a-f0-9]{32}$/.test(ref) || !/^[1-9]\d{0,7}$/.test(amount)) throw new ServiceUnavailableException('VNPay yêu cầu số tiền nguyên dương hợp lệ.');
    const ip = clientIp.replace(/^::ffff:/, '');
    if (!isIP(ip)) throw new ServiceUnavailableException('Địa chỉ IP thanh toán không hợp lệ.');
    const params = { vnp_Version: '2.1.0', vnp_Command: 'pay', vnp_TmnCode: config.tmnCode, vnp_Amount: (BigInt(amount) * 100n).toString(), vnp_CurrCode: 'VND', vnp_TxnRef: ref, vnp_OrderInfo: `Thanh toan BrewLite ${ref}`, vnp_OrderType: 'other', vnp_Locale: 'vn', vnp_ReturnUrl: config.returnUrl, vnp_IpAddr: ip, vnp_CreateDate: vnDate(createdAt), vnp_ExpireDate: vnDate(expiresAt) };
    return `${VNPAY_SANDBOX}?${vnCanonical(params)}&vnp_SecureHash=${vnSignature(params, config.secret)}`;
  }
  verify(query: Record<string, unknown>): VNParams | null {
    const { secret, tmnCode } = this.config();
    const params: VNParams = {};
    for (const [key, value] of Object.entries(query)) {
      if (!key.startsWith('vnp_')) continue;
      if (typeof value !== 'string' || value.length > 2048) return null;
      params[key] = value;
    }
    const signature = params.vnp_SecureHash;
    if (!signature || !/^[\da-f]{128}$/i.test(signature)) return null;
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(vnSignature(params, secret), 'hex'))) return null;
    if (params.vnp_TmnCode !== tmnCode || !/^[a-f0-9]{32}$/.test(params.vnp_TxnRef ?? '') || !/^\d{1,12}$/.test(params.vnp_Amount ?? '') || !/^\d{2}$/.test(params.vnp_ResponseCode ?? '') || !/^\d{2}$/.test(params.vnp_TransactionStatus ?? '')) return null;
    return params;
  }
  outcome(params: VNParams): 'SUCCESS' | 'FAILED' | 'UNKNOWN' {
    if (params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00' && /^[1-9]\d{0,14}$/.test(params.vnp_TransactionNo ?? '')) return 'SUCCESS';
    // Processing, reversal, fraud and contradictory responses require reconciliation.
    if (['01', '04', '05', '06', '07', '09'].includes(params.vnp_TransactionStatus) || params.vnp_ResponseCode === '07') return 'UNKNOWN';
    if (params.vnp_TransactionStatus === '02' && ['09', '10', '11', '12', '13', '24', '51', '65', '75', '79', '99'].includes(params.vnp_ResponseCode)) return 'FAILED';
    return 'UNKNOWN';
  }
  async query(ref: string, createdAt: Date, expectedAmount: string) {
    const { tmnCode, secret } = this.config();
    const params: VNParams = { vnp_RequestId: randomUUID().replace(/-/g, ''), vnp_Version: '2.1.0', vnp_Command: 'querydr', vnp_TmnCode: tmnCode, vnp_TxnRef: ref, vnp_TransactionDate: vnDate(createdAt), vnp_CreateDate: vnDate(new Date()), vnp_IpAddr: process.env.VNPAY_SERVER_IP || '127.0.0.1', vnp_OrderInfo: `Truy van BrewLite ${ref}` };
    const data = ['vnp_RequestId', 'vnp_Version', 'vnp_Command', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_TransactionDate', 'vnp_CreateDate', 'vnp_IpAddr', 'vnp_OrderInfo'].map((key) => params[key]).join('|');
    params.vnp_SecureHash = createHmac('sha512', secret).update(data).digest('hex');
    const response = await fetch('https://sandbox.vnpayment.vn/merchant_webapi/api/transaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const result: VNParams = {};
    for (const [key, value] of Object.entries(raw)) { if (typeof value !== 'string') return null; result[key] = value; }
    const signedFields = ['vnp_ResponseId', 'vnp_Command', 'vnp_ResponseCode', 'vnp_Message', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_Amount', 'vnp_BankCode', 'vnp_PayDate', 'vnp_TransactionNo', 'vnp_TransactionType', 'vnp_TransactionStatus', 'vnp_OrderInfo', 'vnp_PromotionCode', 'vnp_PromotionAmount'];
    const digest = createHmac('sha512', secret).update(signedFields.map((key) => result[key] ?? '').join('|')).digest('hex');
    if (!/^[a-f0-9]{128}$/i.test(result.vnp_SecureHash ?? '') || !timingSafeEqual(Buffer.from(result.vnp_SecureHash, 'hex'), Buffer.from(digest, 'hex'))) return null;
    if (result.vnp_TmnCode !== tmnCode || result.vnp_TxnRef !== ref || result.vnp_Command !== 'querydr' || result.vnp_ResponseCode !== '00' || result.vnp_TransactionType !== '01' || result.vnp_Amount !== (BigInt(expectedAmount) * 100n).toString() || !result.vnp_ResponseId) return null;
    const outcome = result.vnp_TransactionStatus === '00' && /^[1-9]\d{0,14}$/.test(result.vnp_TransactionNo ?? '') ? 'SUCCESS' : result.vnp_TransactionStatus === '02' ? 'FAILED' : 'UNKNOWN';
    return { params: result, outcome: outcome as 'SUCCESS' | 'FAILED' | 'UNKNOWN' };
  }
}
