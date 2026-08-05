import { Inject, Injectable } from '@nestjs/common';
import { EXTERNAL_SERVICE_DEFINITIONS, type ExternalServiceDefinition } from './external-service-definition';

@Injectable()
export class ExternalServiceRegistry {
  private readonly definitions = new Map<string, ExternalServiceDefinition>();

  constructor(@Inject(EXTERNAL_SERVICE_DEFINITIONS) definitions: ExternalServiceDefinition[]) {
    for (const definition of definitions) {
      this.definitions.set(definition.serviceName, definition);
    }
  }

  get(serviceName: string): ExternalServiceDefinition | undefined {
    return this.definitions.get(serviceName);
  }

  list(): ExternalServiceDefinition[] {
    return Array.from(this.definitions.values());
  }

  listServices(): string[] {
    return Array.from(this.definitions.keys());
  }
}
