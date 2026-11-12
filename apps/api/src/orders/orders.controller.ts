import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessGuard, CurrentActor } from '../access/access.guard';
import type { Actor } from '../access/access.guard';
import { OrderQueryDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(AccessGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: OrderQueryDto) {
    return this.orders.listMine(actor.id, query);
  }

  @Get(':id')
  detail(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getMine(id, actor.id);
  }
}
