import { ForbiddenException, Injectable, Logger } from "@nestjs/common"
import { InjectQueue } from "@nestjs/bullmq"
import { Queue } from "bullmq"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { projectSettings, projects, tenantSettings } from "../../db/schema"
import { MAKARA_TENANT_GROUP_PREFIX, TenantService } from "../tenant/tenant.service"
import {
  TENANT_MAKARA_REAPPLY_QUEUE,
  type MakaraReapplyJobData,
  type TenantSettingsResponse,
  type UpdateTenantSettingsDto,
} from "./tenant-settings.types"

@Injectable()
export class TenantSettingsService {
  private readonly logger = new Logger(TenantSettingsService.name)

  constructor(
    private readonly tenantService: TenantService,
    @InjectQueue(TENANT_MAKARA_REAPPLY_QUEUE)
    private readonly reapplyQueue: Queue<MakaraReapplyJobData>,
  ) {}

  async get(tenantId: string): Promise<TenantSettingsResponse> {
    const [row] = await db
      .select({ makaraTenantName: tenantSettings.makaraTenantName })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
    return { makaraTenantName: row?.makaraTenantName ?? null }
  }

  async update(
    tenantId: string,
    dto: UpdateTenantSettingsDto,
    groupsHeader: string | undefined,
  ): Promise<TenantSettingsResponse> {
    const submitted = dto.makaraTenantName?.trim()
    if (!submitted) {
      throw new ForbiddenException("makaraTenantName is required")
    }

    const allowed = groupsHeader
      ? this.tenantService.parseGroupsByPrefix(groupsHeader, MAKARA_TENANT_GROUP_PREFIX)
      : []
    if (!allowed.includes(submitted)) {
      throw new ForbiddenException(
        "Selected Makara tenant is not in your Makara tenants",
      )
    }

    await db
      .insert(tenantSettings)
      .values({ tenantId, makaraTenantName: submitted })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: { makaraTenantName: submitted },
      })

    await this.enqueueReapplies(tenantId, submitted)

    return { makaraTenantName: submitted }
  }

  private async enqueueReapplies(tenantId: string, makaraTenantName: string): Promise<void> {
    const rows = await db
      .select({ projectId: projects.id })
      .from(projects)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .where(and(eq(projects.tenantId, tenantId), eq(projectSettings.authMode, "makara")))

    if (rows.length === 0) return

    await this.reapplyQueue.addBulk(
      rows.map((row) => ({
        name: "reapply",
        data: { projectId: row.projectId, makaraTenantName },
        opts: {
          jobId: `tenant__${tenantId}__project__${row.projectId}__makara-reapply`,
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      })),
    )
    this.logger.log(
      `Enqueued ${rows.length} Makara reapply job(s) for tenant ${tenantId} → ${makaraTenantName}`,
    )
  }
}
