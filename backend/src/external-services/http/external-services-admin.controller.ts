import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Perms } from '../../permission/permission.constants';
import { RequirePermission } from '../../permission/permission.guard';
import { hasPermission } from '../../permission/permission.utils';
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
    @Headers('x-forwarded-groups') groupsHeader: string | undefined,
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('GET', tenant, groupsHeader, params, query, body);
  }

  @Post(':service/*')
  post(
    @CurrentTenant() tenant: TenantContext,
    @Headers('x-forwarded-groups') groupsHeader: string | undefined,
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('POST', tenant, groupsHeader, params, query, body);
  }

  @Patch(':service/*')
  patch(
    @CurrentTenant() tenant: TenantContext,
    @Headers('x-forwarded-groups') groupsHeader: string | undefined,
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('PATCH', tenant, groupsHeader, params, query, body);
  }

  @Delete(':service/*')
  delete(
    @CurrentTenant() tenant: TenantContext,
    @Headers('x-forwarded-groups') groupsHeader: string | undefined,
    @Param() params: Record<string, string>,
    @Query() query: DispatchQuery,
    @Body() body: JsonValue | undefined
  ): Promise<JsonValue> {
    return this.dispatch('DELETE', tenant, groupsHeader, params, query, body);
  }

  private async dispatch(
    method: ServiceRouteMethod,
    tenant: TenantContext,
    groupsHeader: string | undefined,
    params: Record<string, string>,
    query: DispatchQuery,
    body: JsonValue | undefined
  ): Promise<JsonValue> {
    const definition = definitionOf(this.registry, params);
    const segments = subpathSegmentsOf(params);

    const matched = matchServiceRoute(definition.routes?.admin ?? [], method, segments);
    if (!matched) throw routeNotFound(definition.serviceName, method, segments);

    const projectEnvironmentId = matched.params.projectEnvironmentId;
    if (projectEnvironmentId) {
      await this.assertEnvironmentInTenant(projectEnvironmentId, tenant.tenantId);
    } else {
      assertPlatformResourceAccess(groupsHeader);
    }

    return matched.route.handler({
      tenantId: tenant.tenantId,
      params: matched.params,
      body: jsonBodyOf(body),
      query: queryOf(query),
    });
  }

  private async assertEnvironmentInTenant(projectEnvironmentId: string, tenantId: string): Promise<void> {
    const environment = await this.projectEnvironmentService.findByIdOrNull(projectEnvironmentId);
    if (!environment || environment.tenantId !== tenantId) {
      throw new NotFoundException(`Project environment ${projectEnvironmentId} not found`);
    }
  }
}

function assertPlatformResourceAccess(groupsHeader: string | undefined): void {
  if (!hasPermission(groupsHeader ?? '', Perms.manageExternalServiceResources)) {
    throw new ForbiddenException(`Missing permission: ${Perms.manageExternalServiceResources}`);
  }
}
