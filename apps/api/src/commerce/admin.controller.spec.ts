import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/auth.guards';
import { StoreAdminController } from './admin.controller';

describe('StoreAdminController access', () => {
  const guard = new RolesGuard(new Reflector());
  const context = (role?: string) =>
    ({
      getClass: () => StoreAdminController,
      getHandler: () => function orderStatsHandler() {},
      switchToHttp: () => ({
        getRequest: () => ({
          principal: role ? { user: { role } } : undefined,
        }),
      }),
    }) as never;

  it('allows ADMIN and rejects other roles or missing authentication', () => {
    expect(guard.canActivate(context('ADMIN'))).toBe(true);
    expect(() => guard.canActivate(context('CUSTOMER'))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(context('STAFF'))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });
});
