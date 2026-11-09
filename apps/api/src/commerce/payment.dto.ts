import { IsIn, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsIn(['WALLET', 'CARD', 'VNPAY'])
  method!: string;
}
