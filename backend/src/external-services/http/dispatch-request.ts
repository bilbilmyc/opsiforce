import { NotFoundException } from '@nestjs/common';
import type {
  AdminRouteContext,
  ExternalServiceDefinition,
  JsonValue,
  ServiceRouteMethod,
} from '../platform/external-service-definition';
import type { ExternalServiceRegistry } from '../platform/external-service-registry';
import { splitRoutePath } from './service-route-matcher';

export type DispatchQuery = Record<string, string | string[] | undefined>;

const WILDCARD_PARAM = '*';
const SERVICE_PARAM = 'service';

export function definitionOf(
  registry: ExternalServiceRegistry,
  params: Record<string, string>
): ExternalServiceDefinition {
  const serviceName = params[SERVICE_PARAM] ?? '';
  const definition = registry.get(serviceName);
  if (!definition) {
    throw new NotFoundException(`Unknown external service "${serviceName}"`);
  }
  return definition;
}

export function subpathSegmentsOf(params: Record<string, string>): string[] {
  return splitRoutePath(params[WILDCARD_PARAM] ?? '');
}

export function environmentIdParam(context: AdminRouteContext): string {
  return context.params.projectEnvironmentId ?? '';
}

export function jsonBodyOf(body: JsonValue | undefined): JsonValue {
  return body ?? null;
}

export function queryOf(query: DispatchQuery | undefined): Record<string, string> {
  const collected: Record<string, string> = {};

  for (const [key, value] of Object.entries(query ?? {})) {
    const single = Array.isArray(value) ? value.at(-1) : value;
    if (typeof single === 'string') collected[key] = single;
  }

  return collected;
}

export function routeNotFound(serviceName: string, method: ServiceRouteMethod, segments: string[]): NotFoundException {
  return new NotFoundException(`No ${serviceName} route for ${method} ${segments.join('/')}`);
}
