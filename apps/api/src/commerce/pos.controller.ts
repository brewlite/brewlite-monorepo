import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.guards';
import {
  JwtAuthGuard,
  OriginGuard,
  Roles,
  RolesGuard,
} from '../auth/auth.guards';
import { PosService } from './pos.service';

@Controller('staff/pos')
@UseGuards(OriginGuard, JwtAuthGuard, RolesGuard)
@Roles('STAFF')
export class StaffPosController {
  constructor(private readonly pos: PosService) {}

  @Get('shifts/current')
  currentShift(@Req() r: AuthRequest) {
    return this.pos.currentShift(r.principal.user.id);
  }

  @Post('shifts/open')
  openShift(
    @Req() r: AuthRequest,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.pos.openShift(r.principal.user.id, b, key);
  }

  @Post('shifts/current/close')
  @HttpCode(200)
  closeShift(
    @Req() r: AuthRequest,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.pos.closeShift(r.principal.user.id, b, key);
  }

  @Get('orders')
  listOrders() {
    return this.pos.listCounterOrders();
  }

  @Post('orders')
  createOrder(
    @Req() r: AuthRequest,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.pos.createCounterOrder(r.principal.user.id, b, key);
  }

  @Post('orders/:id/payments')
  payOrder(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.pos.payCounterOrder(r.principal.user.id, id, b, key, r.ip);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancelOrder(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.pos.cancelCounterOrder(r.principal.user.id, id, b, key);
  }

  @Post('payments/:id/reconcile')
  @HttpCode(200)
  reconcilePayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.pos.reconcileCounterPayment(id);
  }
}
