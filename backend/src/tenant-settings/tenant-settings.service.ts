import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { projectEnvironments, projects, tenantSettings } from '../../db/schema';
import { MAKARA_TENANT_GROUP_PREFIX, TenantService } from '../tenant/tenant.service';
import {
  MAKARA_AUTH_SYNC_QUEUE,
  type MakaraAuthSyncJobData,
  type TenantSettingsResponse,
  type UpdateTenantSettingsDto,
} from './tenant-settings.types';

@Injectable()
export class TenantSettingsService {
  private readonly logger = new Logger(TenantSettingsService.name);

  constructor(
    private readonly tenantService: TenantService,
    @InjectQueue(MAKARA_AUTH_SYNC_QUEUE)
    private readonly makaraAuthSyncQueue: Queue<MakaraAuthSyncJobData>
  ) {}

  async get(tenantId: string): Promise<TenantSettingsResponse> {
    const [row] = await db
      .select({ makaraTenantName: tenantSettings.makaraTenantName })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId));
    return { makaraTenantName: row?.makaraTenantName ?? null };
  }

  async update(
    tenantId: string,
    dto: UpdateTenantSettingsDto,
    groupsHeader: string | undefined
  ): Promise<TenantSettingsResponse> {
    const submitted = dto.makaraTenantName?.trim();
    if (!submitted) {
      throw new ForbiddenException('makaraTenantName is required');
    }

    const allowed = groupsHeader
      ? this.tenantService.parseGroupsByPrefix(groupsHeader, MAKARA_TENANT_GROUP_PREFIX)
      : [];
    if (!allowed.includes(submitted)) {
      throw new ForbiddenException('Selected Makara tenant is not in your Makara tenants');
    }

    await db
      .insert(tenantSettings)
      .values({ tenantId, makaraTenantName: submitted })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: { makaraTenantName: submitted },
      });

    await this.enqueueMakaraAuthSync(tenantId, submitted);

    return { makaraTenantName: submitted };
  }

  private async enqueueMakaraAuthSync(tenantId: string, makaraTenantName: string): Promise<void> {
    const rows = await db
      .selectDistinct({ projectId: projects.id })
      .from(projects)
      .innerJoin(projectEnvironments, eq(projectEnvironments.projectId, projects.id))
      .where(and(eq(projects.tenantId, tenantId), eq(projectEnvironments.authMode, 'makara')));

    if (rows.length === 0) return;

    await this.makaraAuthSyncQueue.addBulk(
      rows.map((row) => ({
        name: 'sync-project-makara-auth',
        data: { projectId: row.projectId, makaraTenantName },
        opts: {
          jobId: `tenant__${tenantId}__project__${row.projectId}__makara-auth-sync`,
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      }))
    );
    this.logger.log(`Enqueued ${rows.length} Makara auth sync job(s) for tenant ${tenantId} → ${makaraTenantName}`);
  }
}
