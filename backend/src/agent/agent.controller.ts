import { Controller, Get } from '@nestjs/common';
import { AgentService } from './agent.service';
import type { AgentResponse } from './agent.types';

@Controller('agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  findAll(): Promise<AgentResponse[]> {
    return this.agentService.findAll();
  }
}
