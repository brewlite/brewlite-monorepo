import { imageExtension, ProductImageController } from './product-image.controller';
import { BadRequestException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/auth.guards';

describe('product image validation', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
  it('accepts actual PNG bytes and rejects mismatched or executable content', () => {
    expect(imageExtension(png, 'image/png')).toBe('png');
    expect(() => imageExtension(png, 'image/jpeg')).toThrow(BadRequestException);
    expect(() => imageExtension(Buffer.from('<svg onload="alert(1)"/>'), 'image/png')).toThrow(BadRequestException);
  });
  it('rejects empty, missing and oversized files', async () => {
    expect(() => imageExtension(Buffer.alloc(0), 'image/png')).toThrow(BadRequestException);
    expect(() => imageExtension(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png')).toThrow(BadRequestException);
    await expect(new ProductImageController().upload()).rejects.toThrow(BadRequestException);
  });
  it.each(['CUSTOMER', 'STAFF'])('denies %s access to the upload controller', (role) => {
    const context = { getClass: () => ProductImageController, getHandler: () => function uploadHandler() {}, switchToHttp: () => ({ getRequest: () => ({ principal: { user: { role } } }) }) } as unknown as ExecutionContext;
    expect(() => new RolesGuard(new Reflector()).canActivate(context)).toThrow('Bạn không có quyền');
  });
  it('allows ADMIN through the role guard', () => {
    const context = { getClass: () => ProductImageController, getHandler: () => function uploadHandler() {}, switchToHttp: () => ({ getRequest: () => ({ principal: { user: { role: 'ADMIN' } } }) }) } as unknown as ExecutionContext;
    expect(new RolesGuard(new Reflector()).canActivate(context)).toBe(true);
  });
});
