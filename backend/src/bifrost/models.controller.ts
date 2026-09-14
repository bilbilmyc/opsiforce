import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { BifrostService } from './bifrost.service';
import { RequirePermission } from '../permission/permission.guard';
import { Perms } from '../permission/permission.constants';

@Controller('models')
export class ModelsController {
  constructor(private readonly bifrost: BifrostService) {}

  @Get()
  list() { return this.bifrost.modelCatalog(); }

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
