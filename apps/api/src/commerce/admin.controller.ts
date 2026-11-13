import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  DefaultValuePipe,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type { AuthRequest } from '../auth/auth.guards';
import {
  JwtAuthGuard,
  OriginGuard,
  RolesGuard,
  Roles,
} from '../auth/auth.guards';
import { CommerceService } from './commerce.service';
import { StoreAdminService } from './admin.service';

@Controller('admin')
@UseGuards(OriginGuard, JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class StoreAdminController {
  constructor(
    private readonly service: StoreAdminService,
    private readonly commerce: CommerceService,
  ) {}
  @Get('dashboard') dashboard() {
    return this.service.dashboard();
  }
  @Get('orders') orders() {
    return this.commerce.orders('', true);
  }
  @Get('orders/:id') order(@Param('id') id: string) {
    return this.commerce.adminOrder(id);
  }
  @Get('users/:id/order-stats') orderStats(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.orderStats(id);
  }
  @Get('users/:id/orders') recentOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Query('status') status?: OrderStatus,
  ) {
    return this.service.recentOrders(id, page, pageSize, status);
  }
  @Patch('sizes/:id/inventory') inventory(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.inventory(id, b, r.principal.user.id);
  }
  @Get(':kind') list(@Param('kind') kind: string) {
    return this.service.list(kind);
  }
  @Post(':kind') create(
    @Param('kind') kind: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.save(kind, b, undefined, r.principal.user.id);
  }
  @Patch(':kind/:id') update(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    return this.service.save(kind, b, id, r.principal.user.id);
  }
}
