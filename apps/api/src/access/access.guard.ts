import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { verify } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';

export type Actor = { id: string; role: UserRole };
type AuthenticatedRequest = Request & { actor: Actor };

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().actor,
);

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) {
      throw new UnauthorizedException('Cần access token hợp lệ.');
    }

    const secret = process.env.JWT_SECRET;
    // Fail closed: never fall back to a public/sample key.
    if (
      !secret ||
      Buffer.byteLength(secret) < 32 ||
      secret === 'super-secret-brewlite-key-change-in-production'
    ) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình khóa xác thực an toàn.',
      );
    }

    let subject: string;
    try {
      const payload = verify(authorization.slice(7), secret, {
        algorithms: ['HS256'],
        ...(process.env.JWT_ISSUER ? { issuer: process.env.JWT_ISSUER } : {}),
        ...(process.env.JWT_AUDIENCE
          ? { audience: process.env.JWT_AUDIENCE }
          : {}),
      });
      if (
        typeof payload === 'string' ||
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        typeof payload.exp !== 'number' ||
        payload.tokenUse !== 'access'
      ) {
        throw new Error('Invalid access claims');
      }
      subject = payload.sub;
    } catch {
      throw new UnauthorizedException(
        'Access token không hợp lệ hoặc đã hết hạn.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: subject },
      select: { id: true, role: true },
    });
    if (!user) throw new UnauthorizedException('Tài khoản không còn tồn tại.');
    // Never trust a role or userId supplied by the client/token.
    request.actor = user;
    return true;
  }
}

@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { actor } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      !actor ||
      (actor.role !== UserRole.STAFF && actor.role !== UserRole.ADMIN)
    ) {
      throw new ForbiddenException(
        'Chỉ nhân viên hoặc quản lý được xử lý đơn.',
      );
    }
    return true;
  }
}
