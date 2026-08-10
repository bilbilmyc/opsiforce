import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Perms } from '../../permission/permission.constants';
import { RequirePermission } from '../../permission/permission.guard';
import {
  definitionOf,
  jsonBodyOf,
  queryOf,
  routeNotFound,
  subpathSegmentsOf,
  type DispatchQuery,
} from './dispatch-request';
import type { JsonValue, ServiceRouteMethod } from '../platform/external-service-definition';
import { ExternalServiceRegistry } from '../platform/external-service-registry';
import { matchServiceRoute } from './service-route-matcher';

export interface ExternalServiceSummary {
  name: string;
  displayName: string;
}

@Controller('external-services/admin')
@RequirePermission(Perms.manageExternalServices)
export class ExternalServicesAdminController {
  constructor(private readonly registry: ExternalServiceRegistry) {}

  @Get('services')
  services(): ExternalServiceSummary[] {
    return this.registry
      .list()
      .map((definition) => ({ name: definition.serviceName, displayName: definition.displayName }));
  }

  @Get(':service/*')
  get(
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('GET', params, query, body);
  }

  @Post(':service/*')
  post(
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('POST', params, query, body);
  }

  @Patch(':service/*')
  patch(
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('PATCH', params, query, body);
  }

  @Delete(':service/*')
  delete(
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('DELETE', params, query, body);
  }

  private dispatch(
    method: ServiceRouteMethod,
    params: Record<string, string>,
    query: DispatchQuery,
    body: JsonValue | undefined
  ): Promise<JsonValue> {
    const definition = definitionOf(this.registry, params);
    const segments = subpathSegmentsOf(params);

    const matched = matchServiceRoute(definition.routes?.admin ?? [], method, segments);
    if (!matched) throw routeNotFound(definition.serviceName, method, segments);

    return matched.route.handler({ params: matched.params, body: jsonBodyOf(body), query: queryOf(query) });
  }
}
