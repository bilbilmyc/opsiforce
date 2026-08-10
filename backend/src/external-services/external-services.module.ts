import { Module, type Type } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { GatewayAuthGuard } from '../gateway/gateway-auth.guard';
import { ExternalServicesAdminController } from './http/external-services-admin.controller';
import { ExternalServicesAgentController } from './http/external-services-agent.controller';
import { WebhooksController } from './http/webhooks.controller';
import { IncomingEmailAddressService } from './incoming-email/incoming-email-address.service';
import { IncomingEmailDefinition } from './incoming-email/incoming-email.definition';
import { AppDoorbellService } from './platform/app-doorbell.service';
import { ExternalServiceConfigStore } from './platform/external-service-config-store.service';
import { EXTERNAL_SERVICE_DEFINITIONS, type ExternalServiceDefinition } from './platform/external-service-definition';
import { ExternalServicePublishService } from './platform/external-service-publish.service';
import { ExternalServiceProvisioningService } from './platform/external-service-provisioning.service';
import { ExternalServiceRegistry } from './platform/external-service-registry';
import { ExternalServiceStore } from './platform/external-service-store.service';
import { WebhookIngestService } from './platform/webhook-ingest.service';
import { ExternalServiceUsageController } from './usage/external-service-usage.controller';
import { ExternalServiceUsageService } from './usage/external-service-usage.service';
import { WhapiClient } from './whatsapp/whapi.client';
import { WhatsappChannelService } from './whatsapp/whatsapp-channel.service';
import { WhatsappDefinition } from './whatsapp/whatsapp.definition';

const DEFINITION_CLASSES: ReadonlyArray<Type<ExternalServiceDefinition>> = [
  IncomingEmailDefinition,
  WhatsappDefinition,
];

@Module({
  imports: [GatewayModule],
  controllers: [
    WebhooksController,
    ExternalServicesAgentController,
    ExternalServicesAdminController,
    ExternalServiceUsageController,
  ],
  providers: [
    GatewayAuthGuard,
    AppDoorbellService,
    ExternalServiceConfigStore,
    IncomingEmailAddressService,
    ...DEFINITION_CLASSES,
    {
      provide: EXTERNAL_SERVICE_DEFINITIONS,
      useFactory: (...definitions: ExternalServiceDefinition[]) => definitions,
      inject: [...DEFINITION_CLASSES],
    },
    ExternalServiceRegistry,
    ExternalServicePublishService,
    ExternalServiceProvisioningService,
    ExternalServiceStore,
    ExternalServiceUsageService,
    WebhookIngestService,
    WhapiClient,
    WhatsappChannelService,
  ],
  exports: [IncomingEmailAddressService, ExternalServicePublishService, ExternalServiceProvisioningService],
})
export class ExternalServicesModule {}
