import { Module } from '@nestjs/common';
import { InternalAppsController } from './apps.controller';

@Module({
  controllers: [InternalAppsController],
})
export class InternalAppsModule {}
