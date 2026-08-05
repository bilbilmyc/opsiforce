import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Perms } from '../permission/permission.constants';
import { RequirePermission } from '../permission/permission.guard';
import { WhapiChannelService } from './whapi-channel.service';
import type {
  ConfigureWhapiWebhookDto,
  ConfigureWhapiWebhookResult,
  CreateWhapiChannelDto,
  CreateWhapiChatRouteDto,
  UpdateWhapiChannelDto,
  WhapiChannelResponse,
  WhapiChatOption,
  WhapiChatRouteResponse,
  WhapiOrganization,
  WhapiRoutableEnvironment,
} from './whapi-channel.types';

@Controller('admin/whatsapp')
@RequirePermission(Perms.manageWhapiChannels)
export class WhapiChannelsController {
  constructor(private readonly whapiChannelService: WhapiChannelService) {}

  @Get('organizations')
  listOrganizations(): Promise<WhapiOrganization[]> {
    return this.whapiChannelService.listOrganizations();
  }

  @Get('channels')
  listChannels(): Promise<WhapiChannelResponse[]> {
    return this.whapiChannelService.listChannels();
  }

  @Post('channels')
  createChannel(@Body() dto: CreateWhapiChannelDto): Promise<WhapiChannelResponse> {
    return this.whapiChannelService.createChannel(dto ?? {});
  }

  @Patch('channels/:id')
  updateChannel(@Param('id') id: string, @Body() dto: UpdateWhapiChannelDto): Promise<WhapiChannelResponse> {
    return this.whapiChannelService.updateChannel(id, dto ?? {});
  }

  @Delete('channels/:id')
  async deleteChannel(@Param('id') id: string): Promise<{ ok: true }> {
    await this.whapiChannelService.deleteChannel(id);
    return { ok: true };
  }

  @Post('channels/:id/configure-webhook')
  configureWebhook(
    @Param('id') id: string,
    @Body() dto: ConfigureWhapiWebhookDto
  ): Promise<ConfigureWhapiWebhookResult> {
    return this.whapiChannelService.configureWebhook(id, dto ?? {});
  }

  @Get('channels/:id/chats')
  listChats(@Param('id') id: string): Promise<WhapiChatOption[]> {
    return this.whapiChannelService.listChats(id);
  }

  @Get('channels/:id/environments')
  listEnvironments(@Param('id') id: string): Promise<WhapiRoutableEnvironment[]> {
    return this.whapiChannelService.listRoutableEnvironments(id);
  }

  @Get('channels/:id/routes')
  listRoutes(@Param('id') id: string): Promise<WhapiChatRouteResponse[]> {
    return this.whapiChannelService.listRoutes(id);
  }

  @Post('channels/:id/routes')
  createRoute(@Param('id') id: string, @Body() dto: CreateWhapiChatRouteDto): Promise<WhapiChatRouteResponse> {
    return this.whapiChannelService.createRoute(id, dto ?? {});
  }

  @Delete('channels/:id/routes/:routeId')
  async deleteRoute(@Param('id') id: string, @Param('routeId') routeId: string): Promise<{ ok: true }> {
    await this.whapiChannelService.deleteRoute(id, routeId);
    return { ok: true };
  }
}
