import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { GatewayKeyService } from './gateway-key.service';
import { GatewayAuthGuard } from './gateway-auth.guard';
import { ServiceProviderRegistry } from './providers/provider-registry';
import { EmailProvider } from './providers/email.provider';
import { SERVICE_PROVIDERS } from './providers/service-provider.interface';

@Module({
  controllers: [GatewayController],
  providers: [
    GatewayService,
    GatewayKeyService,
    GatewayAuthGuard,
    EmailProvider,
    {
      provide: SERVICE_PROVIDERS,
      useFactory: (email: EmailProvider) => [email],
      inject: [EmailProvider],
    },
    ServiceProviderRegistry,
  ],
  exports: [GatewayKeyService],
})
export class GatewayModule {}
