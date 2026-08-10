import { Inject, Injectable } from '@nestjs/common';
import { EXTERNAL_SERVICE_DEFINITIONS, type ExternalServiceDefinition } from './external-service-definition';

const RESERVED_SERVICE_NAMES = ['usage', 'webhooks', 'agent', 'admin', 'services'];

@Injectable()
export class ExternalServiceRegistry {
  private readonly definitions = new Map<string, ExternalServiceDefinition>();

  constructor(@Inject(EXTERNAL_SERVICE_DEFINITIONS) definitions: ExternalServiceDefinition[]) {
    for (const definition of definitions) {
      const { serviceName } = definition;

      if (RESERVED_SERVICE_NAMES.includes(serviceName)) {
        throw new Error(
          `External service name "${serviceName}" is reserved by the platform route tree (${RESERVED_SERVICE_NAMES.join(', ')})`
        );
      }
      if (this.definitions.has(serviceName)) {
        throw new Error(`External service "${serviceName}" is registered twice`);
      }

      this.definitions.set(serviceName, definition);
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
