import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessGuard, CurrentActor, StaffGuard } from '../access/access.guard';
import type { Actor } from '../access/access.guard';
import { OrderQueryDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller('staff/orders')
@UseGuards(AccessGuard, StaffGuard)
export class StaffOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: OrderQueryDto) {
    return this.orders.listStaff(query);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getStaff(id);
  }

  @Patch(':id/status')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(id, actor, dto);
  }
}
