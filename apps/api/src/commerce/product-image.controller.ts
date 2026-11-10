import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { JwtAuthGuard, OriginGuard, RolesGuard, Roles } from '../auth/auth.guards';

export const productImageDirectory = join(__dirname, '..', '..', 'uploads', 'products');
const MAX_SIZE = 5 * 1024 * 1024;
export function imageExtension(buffer: Buffer, mime: string): string {
  if (!buffer.length || buffer.length > MAX_SIZE) throw new BadRequestException('Ảnh phải có dung lượng từ 1 byte đến 5 MB.');
  if (mime === 'image/png' && buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString('ascii', 12, 16) === 'IHDR') return 'png';
  if (mime === 'image/jpeg' && buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 && buffer[buffer.length - 2] === 255 && buffer[buffer.length - 1] === 217) return 'jpg';
  if (mime === 'image/webp' && buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16))) return 'webp';
  throw new BadRequestException('Chỉ nhận ảnh JPG, PNG hoặc WebP đúng định dạng.');
}

@Controller('admin/product-images')
@UseGuards(OriginGuard, JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProductImageController {
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE, files: 1, fields: 0 } }))
  async upload(@UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    if (!file?.buffer) throw new BadRequestException('Vui lòng chọn ảnh.');
    const extension = imageExtension(file.buffer, file.mimetype);
    const filename = `${randomUUID()}.${extension}`;
    await mkdir(productImageDirectory, { recursive: true });
    await writeFile(join(productImageDirectory, filename), file.buffer, { flag: 'wx' });
    return { path: `/api/product-images/${filename}` };
  }
}
