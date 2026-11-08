import { Module } from '@nestjs/common';
import { AccessGuard, StaffGuard } from './access.guard';

@Module({
  providers: [AccessGuard, StaffGuard],
  exports: [AccessGuard, StaffGuard],
})
export class AccessModule {}
