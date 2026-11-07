import { IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/^0\d{9}$/)
  phone!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
