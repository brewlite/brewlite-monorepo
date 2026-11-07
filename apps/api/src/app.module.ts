import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ToppingsModule } from './toppings/toppings.module';
import { CartModule } from './cart/cart.module';
import { ConfigModule} from '@nestjs/config';
import { AuthModule} from './auth/auth.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ProductsModule,
    ToppingsModule,
    CartModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}

