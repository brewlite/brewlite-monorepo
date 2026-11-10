import { VNPayService, vnCanonical, vnDate, vnParseDate, vnSignature, type VNPayDiagnostic } from './vnpay.service';
import { createHmac } from 'node:crypto';
describe('VNPay Sandbox signing (controlled test configuration only)', () => {
  const service = new VNPayService();
  const previous = { ...process.env };
  beforeAll(() => { process.env.VNPAY_TMN_CODE = 'TESTONLY'; process.env.VNPAY_HASH_SECRET = 'unit-test-key-not-a-merchant'; process.env.VNPAY_RETURN_URL = 'http://localhost:3001/api/payments/vnpay/return'; });
  afterAll(() => { process.env = previous; });
  it('sorts and encodes once, including plus/space/Unicode; excludes signature fields', () => {
    expect(vnCanonical({ vnp_Z: 'a+b c', vnp_A: 'Trà', vnp_SecureHash: 'x', tracking: 'x' })).toBe('vnp_A=Tr%C3%A0&vnp_Z=a%2Bb+c');
    expect(vnDate(new Date('2026-11-07T00:00:00Z'))).toBe('20261107070000');
    expect(vnParseDate('20261107070000')?.toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(vnParseDate('20261301000000')).toBeNull();
    expect(vnParseDate(undefined)).toBeNull();
  });
  it('uses only Sandbox URL, VND multiplied by 100 and GMT+7 dates', () => {
    const url = new URL(service.url('a'.repeat(32), '35000', new Date('2026-11-07T00:00:00Z'), new Date('2026-11-07T00:10:00Z'), '::ffff:127.0.0.1'));
    expect(url.origin).toBe('https://sandbox.vnpayment.vn'); expect(url.searchParams.get('vnp_Amount')).toBe('3500000'); expect(url.searchParams.get('vnp_CreateDate')).toBe('20261107070000');
  });
  it('rejects tampering, merchant mismatch and duplicate/nested query values', () => {
    const params = { vnp_TmnCode: 'TESTONLY', vnp_TxnRef: 'a'.repeat(32), vnp_Amount: '3500000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: '123' };
    const signed = { ...params, vnp_SecureHash: vnSignature(params, process.env.VNPAY_HASH_SECRET!) };
    expect(service.verify(signed)).not.toBeNull(); expect(service.verify({ ...signed, vnp_Amount: '1' })).toBeNull(); expect(service.verify({ ...signed, vnp_TmnCode: ['TESTONLY', 'OTHER'] })).toBeNull();
    const other = { ...params, vnp_TmnCode: 'OTHER' }; expect(service.verify({ ...other, vnp_SecureHash: vnSignature(other, process.env.VNPAY_HASH_SECRET!) })).toBeNull();
  });
  it('does not label pending/reversal/fraud or contradictory responses as success/failure', () => {
    expect(service.outcome({ vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: '123' })).toBe('SUCCESS');
    expect(service.outcome({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' })).toBe('FAILED');
    for (const state of ['01', '04', '05', '07', '99']) expect(service.outcome({ vnp_ResponseCode: '00', vnp_TransactionStatus: state })).toBe('UNKNOWN');
  });
  it('fails closed when merchant configuration is missing', () => {
    const secret = process.env.VNPAY_HASH_SECRET; delete process.env.VNPAY_HASH_SECRET;
    expect(() => service.config()).toThrow(); process.env.VNPAY_HASH_SECRET = secret;
  });
  it('verifies signed querydr responses and preserves uncertainty on bad signature or wrong amount', async () => {
    const originalFetch = globalThis.fetch;
    const fields = ['vnp_ResponseId', 'vnp_Command', 'vnp_ResponseCode', 'vnp_Message', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_Amount', 'vnp_BankCode', 'vnp_PayDate', 'vnp_TransactionNo', 'vnp_TransactionType', 'vnp_TransactionStatus', 'vnp_OrderInfo', 'vnp_PromotionCode', 'vnp_PromotionAmount'];
    const response: Record<string, string> = { vnp_ResponseId: 'test-response', vnp_Command: 'querydr', vnp_ResponseCode: '00', vnp_Message: 'Success', vnp_TmnCode: 'TESTONLY', vnp_TxnRef: 'a'.repeat(32), vnp_Amount: '3500000', vnp_TransactionNo: '123', vnp_TransactionType: '01', vnp_TransactionStatus: '00', vnp_OrderInfo: 'Test only' };
    response.vnp_SecureHash = createHmac('sha512', process.env.VNPAY_HASH_SECRET!).update(fields.map((key) => response[key] ?? '').join('|')).digest('hex');
    try {
      globalThis.fetch = async () => new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
      expect((await service.query('a'.repeat(32), new Date(), '35000'))?.outcome).toBe('SUCCESS');
      expect(await service.query('a'.repeat(32), new Date(), '36000')).toBeNull();
      response.vnp_SecureHash = '0'.repeat(128); expect(await service.query('a'.repeat(32), new Date(), '35000')).toBeNull();
    } finally { globalThis.fetch = originalFetch; }
  });
  it.each([
    ['HTTP_ERROR', () => Promise.resolve(new Response('', { status: 503 }))],
    ['INVALID_JSON', () => Promise.resolve(new Response('not-json', { status: 200 }))],
    ['INVALID_RESPONSE', () => Promise.resolve(new Response('[]', { status: 200 }))],
    ['TIMEOUT', () => Promise.reject(new DOMException('private request context', 'TimeoutError'))],
    ['NETWORK_ERROR', () => Promise.reject(new Error('secret endpoint context'))],
  ] as const)('reports %s without exposing request or exception contents', async (reason, fetcher) => {
    const previousFetch = globalThis.fetch; const reports: VNPayDiagnostic[] = [];
    try {
      globalThis.fetch = fetcher;
      expect(await service.query('a'.repeat(32), new Date(), '45000', (report) => reports.push(report))).toBeNull();
      expect(reports[0].reason).toBe(reason);
      expect(JSON.stringify(reports)).not.toContain('private request context');
      expect(JSON.stringify(reports)).not.toContain(process.env.VNPAY_HASH_SECRET);
    } finally { globalThis.fetch = previousFetch; }
  });
  it('exposes unsigned provider codes only as unverified diagnostics, never settlement', async () => {
    const previousFetch = globalThis.fetch; const reports: VNPayDiagnostic[] = [];
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ vnp_ResponseCode: '91', vnp_Message: 'Not found' }));
      expect(await service.query('a'.repeat(32), new Date(), '45000', (report) => reports.push(report))).toBeNull();
      expect(reports[0]).toEqual({ reason: 'MISSING_SIGNATURE', responseCode: '91', signatureVerified: false });
    } finally { globalThis.fetch = previousFetch; }
  });
  it('preserves authenticated provider errors and accepts the documented optional command', async () => {
    const previousFetch = globalThis.fetch;
    const fields = ['vnp_ResponseId', 'vnp_Command', 'vnp_ResponseCode', 'vnp_Message', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_Amount', 'vnp_BankCode', 'vnp_PayDate', 'vnp_TransactionNo', 'vnp_TransactionType', 'vnp_TransactionStatus', 'vnp_OrderInfo', 'vnp_PromotionCode', 'vnp_PromotionAmount'];
    const raw: Record<string, string> = { vnp_ResponseId: 'response', vnp_ResponseCode: '97', vnp_Message: 'Invalid checksum', vnp_TmnCode: 'TESTONLY', vnp_TxnRef: 'a'.repeat(32), vnp_Amount: '4500000', vnp_TransactionType: '01', vnp_TransactionStatus: '00', vnp_TransactionNo: '123' };
    const reports: VNPayDiagnostic[] = [];
    try {
      globalThis.fetch = async () => {
        const vnp_SecureHash = createHmac('sha512', process.env.VNPAY_HASH_SECRET!).update(fields.map((key) => raw[key] ?? '').join('|')).digest('hex');
        return new Response(JSON.stringify({ ...raw, vnp_SecureHash }));
      };
      expect(await service.query('a'.repeat(32), new Date(), '45000', (report) => reports.push(report))).toBeNull();
      expect(reports[0]).toEqual({ reason: 'PROVIDER_ERROR', responseCode: '97', signatureVerified: true });
      raw.vnp_ResponseCode = '00';
      expect((await service.query('a'.repeat(32), new Date(), '45000'))?.outcome).toBe('SUCCESS');
    } finally { globalThis.fetch = previousFetch; }
  });
});
