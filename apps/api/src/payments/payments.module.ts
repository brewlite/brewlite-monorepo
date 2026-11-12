import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MockPaymentService } from './mock-payment.service';

@Module({
  imports: [AccessModule, OrdersModule],
  providers: [PaymentsService, MockPaymentService],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
