import type { ServiceRoute, ServiceRouteMethod } from '../platform/external-service-definition';

export interface MatchedServiceRoute<Ctx> {
  route: ServiceRoute<Ctx>;
  params: Record<string, string>;
}

export function splitRoutePath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

export function matchServiceRoute<Ctx>(
  routes: ReadonlyArray<ServiceRoute<Ctx>>,
  method: ServiceRouteMethod,
  segments: string[]
): MatchedServiceRoute<Ctx> | null {
  for (const route of routes) {
    if (route.method !== method) continue;

    const params = matchSegments(splitRoutePath(route.path), segments);
    if (params) return { route, params };
  }

  return null;
}

function matchSegments(pattern: string[], segments: string[]): Record<string, string> | null {
  if (pattern.length !== segments.length) return null;

  const params: Record<string, string> = {};

  for (const [index, patternSegment] of pattern.entries()) {
    const segment = segments[index];
    if (segment === undefined) return null;

    if (patternSegment.startsWith(':')) {
      const name = patternSegment.slice(1);
      if (!name) return null;
      params[name] = segment;
      continue;
    }

    if (patternSegment !== segment) return null;
  }

  return params;
}
