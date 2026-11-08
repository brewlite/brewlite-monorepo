import 'dotenv/config';
import cookieParser from 'cookie-parser';
import { allowedOrigins } from './auth/auth.config';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { productImageDirectory } from './commerce/product-image.controller';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(productImageDirectory, { prefix: '/api/product-images/', dotfiles: 'deny', index: false, setHeaders: (response) => { response.setHeader('X-Content-Type-Options', 'nosniff'); } });

  // Cho phép Frontend (Next.js :3000) gọi API
  app.use(cookieParser());
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
  });

  // Tự động validate DTO đầu vào (dùng ở Sprint 2 cho Auth, Orders...)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Prefix toàn bộ route bằng /api (ví dụ: /api/products, /api/orders)
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 BrewLite API đang chạy tại: http://localhost:${port}/api`);
}

void bootstrap();
