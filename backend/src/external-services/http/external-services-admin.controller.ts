import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Perms } from '../../permission/permission.constants';
import { RequirePermission } from '../../permission/permission.guard';
import { ProjectEnvironmentService } from '../../project-environment/project-environment.service';
import { CurrentTenant, type TenantContext } from '../../tenant/tenant.decorator';
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
  constructor(
    private readonly registry: ExternalServiceRegistry,
    private readonly projectEnvironmentService: ProjectEnvironmentService
  ) {}

  @Get('services')
  services(): ExternalServiceSummary[] {
    return this.registry
      .list()
      .map((definition) => ({ name: definition.serviceName, displayName: definition.displayName }));
  }

  @Get(':service/*')
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('GET', tenant, params, query, body);
  }

  @Post(':service/*')
  post(
    @CurrentTenant() tenant: TenantContext,
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('POST', tenant, params, query, body);
  }

  @Patch(':service/*')
  patch(
    @CurrentTenant() tenant: TenantContext,
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('PATCH', tenant, params, query, body);
  }

  @Delete(':service/*')
  delete(
    @CurrentTenant() tenant: TenantContext,
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('DELETE', tenant, params, query, body);
  }

  private async dispatch(
    method: ServiceRouteMethod,
    tenant: TenantContext,
    params: Record<string, string>,
    query: DispatchQuery,
    body: JsonValue | undefined
  ): Promise<JsonValue> {
    const definition = definitionOf(this.registry, params);
    const segments = subpathSegmentsOf(params);

    const matched = matchServiceRoute(definition.routes?.admin ?? [], method, segments);
    if (!matched) throw routeNotFound(definition.serviceName, method, segments);

    await this.assertEnvironmentInTenant(matched.params.projectEnvironmentId, tenant.tenantId);

    return matched.route.handler({ params: matched.params, body: jsonBodyOf(body), query: queryOf(query) });
  }

  private async assertEnvironmentInTenant(projectEnvironmentId: string | undefined, tenantId: string): Promise<void> {
    if (!projectEnvironmentId) return;

    const environment = await this.projectEnvironmentService.findByIdOrNull(projectEnvironmentId);
    if (!environment || environment.tenantId !== tenantId) {
      throw new NotFoundException(`Project environment ${projectEnvironmentId} not found`);
    }
  }
}
