import { BadRequestException, Controller, Get, Headers, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { and, desc, eq } from "drizzle-orm"
import { db } from "../../db"
import { projectApps, projects } from "../../db/schema"
import { RequirePermission } from "../permission/permission.guard"
import { Perms } from "../permission/permission.constants"
import { Public } from "../tenant/tenant.decorator"
import { TenantService } from "../tenant/tenant.service"
import { ProjectStatus } from "../project/project.types"

interface PinnedAppResponse {
  projectId: string
  name: string | null
  description: string | null
  appUrl: string
  pinnedAt: string | null
}

@Public()
@Controller("internal/apps")
export class InternalAppsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
  ) {}

  @Get("pinned")
  @RequirePermission(Perms.listPinnedAppsInternal)
  async listPinned(
    @Headers("x-tenant-name") tenantNameHeader: string | undefined,
  ): Promise<PinnedAppResponse[]> {
    const tenantName = tenantNameHeader?.trim()
    if (!tenantName) {
      throw new BadRequestException("X-Tenant-Name header is required")
    }

    const tenant = await this.tenantService.getTenantByMakaraName(tenantName)
    if (!tenant) throw new NotFoundException(`Tenant ${tenantName} not found`)

    const rows = await db
      .select({
        projectId: projectApps.projectId,
        name: projectApps.name,
        description: projectApps.description,
        pinnedAt: projectApps.pinnedAt,
        projectTitle: projects.title,
      })
      .from(projectApps)
      .innerJoin(projects, eq(projects.id, projectApps.projectId))
      .where(
        and(
          eq(projects.tenantId, tenant.id),
          eq(projects.status, ProjectStatus.Active),
          eq(projectApps.isPinned, true),
        ),
      )
      .orderBy(desc(projectApps.pinnedAt))

    const appsHostname = this.configService.getOrThrow<string>("appsHostname")
    return rows.map((row) => ({
      projectId: row.projectId,
      name: row.name ?? row.projectTitle,
      description: row.description,
      appUrl: `https://${row.projectId}.${appsHostname}/`,
      pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
    }))
  }
}
