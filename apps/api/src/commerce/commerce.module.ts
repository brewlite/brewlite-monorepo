import { InventoryModule } from '../inventory/inventory.module';
import { VNPayService } from './vnpay.service';
import { VNPayController } from './vnpay.controller';
import { AccountController } from './account.controller';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommerceService } from './commerce.service';
import { StoreAdminService } from './admin.service';
import { StoreAdminController } from './admin.controller';
import { ProductImageController } from './product-image.controller';
import { PosService } from './pos.service';
import { StaffPosController } from './pos.controller';
import {
  ConfiguredCartController,
  OrdersController,
  PaymentsController,
  StaffOrdersController,
} from './commerce.controller';
@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [
    AccountController,
    VNPayController,
    ConfiguredCartController,
    OrdersController,
    PaymentsController,
    StaffOrdersController,
    StaffPosController,
    ProductImageController,
    StoreAdminController,
  ],
  providers: [CommerceService, StoreAdminService, VNPayService, PosService],
})
export class CommerceModule {}
