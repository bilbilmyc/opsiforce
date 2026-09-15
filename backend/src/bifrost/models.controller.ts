import { BadRequestException, Body, Controller, Get, Post, Put } from '@nestjs/common';
import { BifrostService } from './bifrost.service';
import { RequirePermission } from '../permission/permission.guard';
import { Perms } from '../permission/permission.constants';

@Controller('models')
export class ModelsController {
  constructor(private readonly bifrost: BifrostService) {}

  @Get()
  list() { return this.bifrost.modelCatalog(); }

  @Put('capabilities')
  @RequirePermission(Perms.managePlatformDefaults)
  setCapabilities() { throw new BadRequestException('模型能力已迁至 Bifrost Model Catalog，请在那里修改；Opsiforce 仅保存运行策略。'); }

  @Put('runtime-policy')
  @RequirePermission(Perms.managePlatformDefaults)
  setRuntimePolicy(@Body() body: { provider?: unknown; model?: unknown; policy?: unknown }) {
    return this.bifrost.setModelPolicy(body.provider, body.model, body.policy);
  }

  @Post('refresh')
  @RequirePermission(Perms.managePlatformDefaults)
  async refresh() {
    await this.bifrost.syncModels();
    return this.bifrost.modelCatalog();
  }

  @Put('default')
  @RequirePermission(Perms.managePlatformDefaults)
  setDefault(@Body() body: { model?: unknown }) { return this.bifrost.setDefaultModel(body?.model); }
}
