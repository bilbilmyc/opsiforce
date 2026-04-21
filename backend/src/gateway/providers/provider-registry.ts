import { Injectable, Inject } from "@nestjs/common"
import type { ServiceProvider } from "./service-provider.interface"
import { SERVICE_PROVIDERS } from "./service-provider.interface"

@Injectable()
export class ServiceProviderRegistry {
  private readonly providers = new Map<string, ServiceProvider>()

  constructor(@Inject(SERVICE_PROVIDERS) providers: ServiceProvider[]) {
    for (const provider of providers) {
      this.providers.set(provider.serviceName, provider)
    }
  }

  get(serviceName: string): ServiceProvider | undefined {
    return this.providers.get(serviceName)
  }

  listServices(): string[] {
    return Array.from(this.providers.keys())
  }
}
