import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class OrderQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

export class UpdateOrderStatusDto {
  @IsIn([OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.COMPLETED])
  status!: OrderStatus;

  @IsIn([OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.READY])
  expectedStatus!: OrderStatus;
}
