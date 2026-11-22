import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

export const VNPAY_SANDBOX = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
export type VNParams = Record<string, string>;
export type VNPayDiagnostic = { reason: string; responseCode?: string; httpStatus?: number; signatureVerified?: boolean; retryAfterSeconds?: number };
const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');
export function vnCanonical(params: VNParams, skipEmpty = true) {
  return Object.keys(params)
    .filter((key) => key.startsWith('vnp_') && !['vnp_SecureHash', 'vnp_SecureHashType'].includes(key) && (!skipEmpty || params[key] !== ''))
    .sort()
    .map((key) => `${encode(key)}=${encode(params[key])}`)
    .join('&');
}
export function vnSignature(params: VNParams, secret: string, skipEmpty = true) {
  return createHmac('sha512', secret).update(vnCanonical(params, skipEmpty), 'utf8').digest('hex');
}
export function vnDate(date: Date) {
  return new Date(date.getTime() + 7 * 3600000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}
/** Parse VNPay yyyyMMddHHmmss in GMT+7. Invalid calendar values return null. */
export function vnParseDate(value: string | undefined): Date | null {
  if (!value || !/^\d{14}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second));
  return vnDate(date) === value ? date : null;
}
@Injectable()
export class VNPayService {
  private readonly logger = new Logger(VNPayService.name);
  logIpn(reply: { RspCode: string }, reference?: string) {
    this.logger.log(JSON.stringify({ event: 'vnpay.ipn', responseCode: reply.RspCode, ...(reference ? { correlation: createHash('sha256').update(reference).digest('hex').slice(0, 16) } : {}) }));
  }
  logReturn(reason: string, params?: VNParams | null) {
    this.logger.log(JSON.stringify({
      event: 'vnpay.return',
      reason,
      ...(params?.vnp_ResponseCode ? { responseCode: params.vnp_ResponseCode } : {}),
      ...(params?.vnp_TransactionStatus ? { transactionStatus: params.vnp_TransactionStatus } : {}),
      ...(params?.vnp_TxnRef ? { correlation: createHash('sha256').update(params.vnp_TxnRef).digest('hex').slice(0, 16) } : {}),
    }));
  }
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
  url(ref: string, amount: string, createdAt: Date, expiresAt: Date, clientIp: string, bankCode?: string) {
    const config = this.config();
    if (!/^[a-f0-9]{32}$/.test(ref) || !/^[1-9]\d{0,7}$/.test(amount)) throw new ServiceUnavailableException('VNPay yêu cầu số tiền nguyên dương hợp lệ.');
    const ip = clientIp.replace(/^::ffff:/, '');
    if (!isIP(ip)) throw new ServiceUnavailableException('Địa chỉ IP thanh toán không hợp lệ.');
    const params: VNParams = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: config.tmnCode,
      vnp_Amount: (BigInt(amount) * 100n).toString(),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: ref,
      vnp_OrderInfo: `Thanh toan BrewLite ${ref}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: config.returnUrl,
      vnp_IpAddr: ip,
      vnp_CreateDate: vnDate(createdAt),
      vnp_ExpireDate: vnDate(expiresAt),
      ...(bankCode ? { vnp_BankCode: bankCode } : {}),
    };
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
    const provided = Buffer.from(signature, 'hex');
    const matched = timingSafeEqual(provided, Buffer.from(vnSignature(params, secret, true), 'hex'))
      || timingSafeEqual(provided, Buffer.from(vnSignature(params, secret, false), 'hex'));
    if (!matched) return null;
    if (
      params.vnp_TmnCode !== tmnCode ||
      !/^[a-f0-9]{32}$/.test(params.vnp_TxnRef ?? '') ||
      !/^\d{1,12}$/.test(params.vnp_Amount ?? '') ||
      !/^\d{2}$/.test(params.vnp_ResponseCode ?? '') ||
      (params.vnp_TransactionStatus !== undefined && params.vnp_TransactionStatus !== '' && !/^\d{2}$/.test(params.vnp_TransactionStatus))
    ) return null;
    return params;
  }
  outcome(params: VNParams): 'SUCCESS' | 'FAILED' | 'UNKNOWN' {
    const status = params.vnp_TransactionStatus ?? '';
    if (params.vnp_ResponseCode === '00' && status === '00' && /^[1-9]\d{0,14}$/.test(params.vnp_TransactionNo ?? '')) return 'SUCCESS';
    // Processing, reversal, fraud and contradictory responses require reconciliation.
    if (['01', '04', '05', '06', '07', '09'].includes(status) || params.vnp_ResponseCode === '07') return 'UNKNOWN';
    if (['09', '10', '11', '12', '13', '24', '51', '65', '75', '79', '99'].includes(params.vnp_ResponseCode) && (status === '' || status === '02' || status === params.vnp_ResponseCode)) return 'FAILED';
    return 'UNKNOWN';
  }
  async query(ref: string, createdAt: Date, expectedAmount: string, onDiagnostic?: (value: VNPayDiagnostic) => void) {
    let responseCode: string | undefined;
    let verified = false;
    const report = (reason: string, httpStatus?: number) => {
      const diagnostic: VNPayDiagnostic = { reason, ...(responseCode ? { responseCode } : {}), ...(httpStatus ? { httpStatus } : {}), signatureVerified: verified };
      onDiagnostic?.(diagnostic);
      this.logger.log(JSON.stringify({ event: 'vnpay.querydr', correlation: createHash('sha256').update(ref).digest('hex').slice(0, 16), ...diagnostic }));
      return null;
    };
    let phase = 'CONFIGURATION_ERROR';
    try {
    const { tmnCode, secret } = this.config();
    const params: VNParams = { vnp_RequestId: randomUUID().replace(/-/g, ''), vnp_Version: '2.1.0', vnp_Command: 'querydr', vnp_TmnCode: tmnCode, vnp_TxnRef: ref, vnp_TransactionDate: vnDate(createdAt), vnp_CreateDate: vnDate(new Date()), vnp_IpAddr: process.env.VNPAY_SERVER_IP || '127.0.0.1', vnp_OrderInfo: `Truy van BrewLite ${ref}` };
    const data = ['vnp_RequestId', 'vnp_Version', 'vnp_Command', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_TransactionDate', 'vnp_CreateDate', 'vnp_IpAddr', 'vnp_OrderInfo'].map((key) => params[key]).join('|');
    params.vnp_SecureHash = createHmac('sha512', secret).update(data).digest('hex');
    phase = 'NETWORK_ERROR';
    const response = await fetch('https://sandbox.vnpayment.vn/merchant_webapi/api/transaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) return report('HTTP_ERROR', response.status);
    phase = 'INVALID_JSON';
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return report('INVALID_RESPONSE');
    const rawCode = (raw as Record<string, unknown>).vnp_ResponseCode;
    if (typeof rawCode === 'string' && /^\d{2}$/.test(rawCode)) responseCode = rawCode;
    const result: VNParams = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value === null || value === undefined) {
        result[key] = '';
        continue;
      }
      if (typeof value !== 'string') return report('INVALID_RESPONSE');
      result[key] = value;
    }
    const signedFields = ['vnp_ResponseId', 'vnp_Command', 'vnp_ResponseCode', 'vnp_Message', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_Amount', 'vnp_BankCode', 'vnp_PayDate', 'vnp_TransactionNo', 'vnp_TransactionType', 'vnp_TransactionStatus', 'vnp_OrderInfo', 'vnp_PromotionCode', 'vnp_PromotionAmount'];
    const digest = createHmac('sha512', secret).update(signedFields.map((key) => result[key] ?? '').join('|')).digest('hex');
    if (!result.vnp_SecureHash) return report('MISSING_SIGNATURE');
    if (!/^[a-f0-9]{128}$/i.test(result.vnp_SecureHash) || !timingSafeEqual(Buffer.from(result.vnp_SecureHash, 'hex'), Buffer.from(digest, 'hex'))) return report('INVALID_SIGNATURE');
    verified = true;
    if (result.vnp_TmnCode !== tmnCode) return report('MERCHANT_MISMATCH');
    if (result.vnp_TxnRef !== ref) return report('REFERENCE_MISMATCH');
    if (result.vnp_ResponseCode !== '00') return report('PROVIDER_ERROR');
    if (result.vnp_Command && result.vnp_Command !== 'querydr') return report('INVALID_COMMAND');
    if (result.vnp_TransactionType !== '01') return report('INVALID_TRANSACTION_TYPE');
    if (result.vnp_Amount !== (BigInt(expectedAmount) * 100n).toString()) return report('AMOUNT_MISMATCH');
    if (!result.vnp_ResponseId) return report('MISSING_RESPONSE_ID');
    // QueryDr vnp_ResponseCode 00 means the inquiry succeeded. The payment result is vnp_TransactionStatus.
    const outcome: 'SUCCESS' | 'FAILED' | 'UNKNOWN' = result.vnp_TransactionStatus === '00' && /^[1-9]\d{0,14}$/.test(result.vnp_TransactionNo ?? '') ? 'SUCCESS' : result.vnp_TransactionStatus === '02' ? 'FAILED' : 'UNKNOWN';
    report('VERIFIED');
    return { params: result, outcome };
    } catch (error) {
      const timedOut = typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string' && ['TimeoutError', 'AbortError'].includes(error.name);
      return report(timedOut ? 'TIMEOUT' : phase);
    }
  }
}
