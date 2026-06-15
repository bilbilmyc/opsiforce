import { Module, forwardRef } from '@nestjs/common';
import { BifrostService } from './bifrost.service';
import { UsageController } from './usage.controller';
import { ProjectModule } from '../project/project.module';

@Module({
  imports: [forwardRef(() => ProjectModule)],
  controllers: [UsageController],
  providers: [BifrostService],
  exports: [BifrostService],
})
export class BifrostModule {}
