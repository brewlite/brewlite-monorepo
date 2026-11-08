import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessGuard, CurrentActor } from '../access/access.guard';
import type { Actor } from '../access/access.guard';
import { OrdersService } from '../orders/orders.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(AccessGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async pay(@Body() dto: CreatePaymentDto, @CurrentActor() actor: Actor) {
    const payment = await this.payments.mockPay(dto, actor.id);
    const order = await this.orders.getMine(dto.orderId, actor.id);
    return { payment, order };
  }
}
