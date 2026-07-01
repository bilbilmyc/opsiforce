import { Global, Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentReconcilerService } from './agent-reconciler.service';
import { AgentService } from './agent.service';

@Global()
@Module({
  controllers: [AgentController],
  providers: [AgentService, AgentReconcilerService],
  exports: [AgentService],
})
export class AgentModule {}
