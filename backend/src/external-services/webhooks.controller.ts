import { Controller, Param, Post, Req } from '@nestjs/common';
import { Public } from '../tenant/tenant.decorator';
import { AppDoorbellService } from './app-doorbell.service';
import { WebhookIngestService } from './webhook-ingest.service';
import { parseWebhookRequest, type WebhookFastifyRequest } from './webhook-request';

@Public()
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhookIngestService: WebhookIngestService,
    private readonly appDoorbell: AppDoorbellService
  ) {}

  @Post(':service')
  async receive(
    @Param('service') service: string,
    @Req() req: WebhookFastifyRequest
  ): Promise<{ received: true; stored: number }> {
    const request = await parseWebhookRequest(req);
    const stored = await this.webhookIngestService.ingest(service, request);

    this.appDoorbell.dispatchAfterAck(stored);

    return { received: true, stored: stored.reduce((total, entry) => total + entry.rowIds.length, 0) };
  }
}
