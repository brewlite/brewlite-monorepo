import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { OrdersController } from './orders.controller';
import { StaffOrdersController } from './staff-orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AccessModule],
  controllers: [OrdersController, StaffOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
