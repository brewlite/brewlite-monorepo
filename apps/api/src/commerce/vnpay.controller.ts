import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CommerceService } from './commerce.service';
import { allowedOrigins } from '../auth/auth.config';

// No JWT/Origin guard: VNPay calls IPN server-to-server; signed payload is mandatory.
@Controller('payments/vnpay')
export class VNPayController {
  constructor(private readonly commerce: CommerceService) {}
  @Get('ipn') ipn(@Query() query: Record<string, unknown>) { return this.commerce.vnpayIpn(query); }
  @Get('return') async returned(@Query() query: Record<string, unknown>, @Res() response: Response) {
    let id: string | null = null;
    try { id = await this.commerce.vnpayReturn(query); } catch { /* fail closed */ }
    const destination = new URL('/payments/result', allowedOrigins()[0]);
    destination.searchParams.set(id ? 'paymentId' : 'invalid', id ?? '1');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    return response.redirect(303, destination.toString());
  }
}
