import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { GatewayAuthGuard } from '../gateway/gateway-auth.guard';
import { AppDoorbellService } from './app-doorbell.service';
import { EXTERNAL_SERVICE_DEFINITIONS } from './external-service-definition';
import { ExternalServicePublishService } from './external-service-publish.service';
import { ExternalServiceRegistry } from './external-service-registry';
import { ExternalServiceStore } from './external-service-store.service';
import { ExternalServiceUsageController } from './external-service-usage.controller';
import { ExternalServiceUsageService } from './external-service-usage.service';
import { IncomingEmailAddressController } from './incoming-email-address.controller';
import { IncomingEmailAddressService } from './incoming-email-address.service';
import { IncomingEmailDefinition } from './incoming-email.definition';
import { WebhookIngestService } from './webhook-ingest.service';
import { WebhooksController } from './webhooks.controller';
import { WhapiChannelService } from './whapi-channel.service';
import { WhapiChannelsController } from './whapi-channels.controller';
import { WhapiClient } from './whapi.client';
import { WhatsappDefinition } from './whatsapp.definition';

@Module({
  imports: [GatewayModule],
  controllers: [
    IncomingEmailAddressController,
    WebhooksController,
    ExternalServiceUsageController,
    WhapiChannelsController,
  ],
  providers: [
    GatewayAuthGuard,
    AppDoorbellService,
    IncomingEmailAddressService,
    IncomingEmailDefinition,
    WhatsappDefinition,
    {
      provide: EXTERNAL_SERVICE_DEFINITIONS,
      useFactory: (incomingEmail: IncomingEmailDefinition, whatsapp: WhatsappDefinition) => [incomingEmail, whatsapp],
      inject: [IncomingEmailDefinition, WhatsappDefinition],
    },
    ExternalServiceRegistry,
    ExternalServicePublishService,
    ExternalServiceStore,
    ExternalServiceUsageService,
    WebhookIngestService,
    WhapiClient,
    WhapiChannelService,
  ],
  exports: [IncomingEmailAddressService, ExternalServicePublishService],
})
export class ExternalServicesModule {}
