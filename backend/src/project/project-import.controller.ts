import { BadRequestException, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { rm } from 'node:fs/promises';
import { ProjectImportService } from './project-import.service';
import { ProjectImportStatus, type ProjectImportJobResponse } from './project-import.types';
import { ProjectService } from './project.service';
import { ProjectEventsService } from './project-events.service';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { CurrentUser, type UserContext } from '../user/user.decorator';
import { UserService } from '../user/user.service';
import { RequirePermission } from '../permission/permission.guard';
import { Perms } from '../permission/permission.constants';
import { getGroupsHeader, hasPermission } from '../permission/permission.utils';

interface MultipartField {
  type: 'field';
  fieldname: string;
  value: string;
}

interface MultipartRequest extends FastifyRequest {
  parts(): AsyncIterableIterator<MultipartFile | MultipartField>;
}

@Controller('projects')
export class ProjectImportController {
  constructor(
    private readonly importService: ProjectImportService,
    private readonly projectService: ProjectService,
    private readonly projectEventsService: ProjectEventsService,
    private readonly userService: UserService
  ) {}

  @Post('import')
  @RequirePermission(Perms.importProject)
  async start(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: UserContext, @Req() req: MultipartRequest) {
    const filePath = this.importService.newUploadPath();
    const fields = new Map<string, string>();
    let received = false;

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          received = true;
          await this.importService.streamUploadToStaging(part.file, filePath);
        } else {
          fields.set(part.fieldname, part.value);
        }
      }

      if (!received) throw new BadRequestException('No file was uploaded');

      const workspaceId = fields.get('workspaceId')?.trim() || null;
      const userId = await this.resolveUserId(user, tenant.tenantId);
      const canManageWorkspaces = hasPermission(getGroupsHeader(req), Perms.manageWorkspaces);
      return await this.importService.startImport({
        tenantId: tenant.tenantId,
        workspaceId,
        userId,
        canManageWorkspaces,
        titleOverride: fields.get('title') ?? null,
        timezone: fields.get('timezone')?.trim() || 'UTC',
        uploadPath: filePath,
      });
    } catch (err) {
      await rm(filePath, { force: true }).catch(() => {});
      throw err;
    }
  }

  @Get(':projectId/import/job')
  @RequirePermission(Perms.importProject)
  async latestJob(
    @Param('projectId') projectId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(projectId, tenant.tenantId, user);
    return this.importService.getLatestJob(projectId);
  }

  @Get(':projectId/import/job/stream')
  @RequirePermission(Perms.importProject)
  async jobStream(
    @Param('projectId') projectId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply
  ) {
    await this.gate(projectId, tenant.tenantId, user);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'x-no-compression': '1',
    });

    let closed = false;
    let lastSerialized: string | null = null;
    let lastJob: ProjectImportJobResponse | null = null;
    let sentTerminal = false;
    let unsubscribe = () => {};
    const heartbeat = setInterval(() => {
      if (!closed) reply.raw.write(': ping\n\n');
    }, 25000);
    const close = () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };

    const send = async () => {
      if (closed) return;
      const job = await this.importService.getLatestJob(projectId);
      if (closed) return;
      if (!job) {
        if (lastJob && !sentTerminal) {
          sentTerminal = true;
          const fallback = { ...lastJob, status: ProjectImportStatus.Failed, error: lastJob.error ?? 'Import failed.' };
          reply.raw.write(`data: ${JSON.stringify(fallback)}\n\n`);
        }
        return;
      }
      lastJob = job;
      if (job.status === ProjectImportStatus.Failed || job.status === ProjectImportStatus.Completed) {
        sentTerminal = true;
      }
      const serialized = JSON.stringify(job);
      if (serialized === lastSerialized) return;
      lastSerialized = serialized;
      reply.raw.write(`data: ${serialized}\n\n`);
    };

    unsubscribe = this.projectEventsService.subscribe(projectId, () => {
      void send();
    });

    req.raw.on('close', close);
    await send();
  }

  private async gate(projectId: string, tenantId: string, user: UserContext): Promise<void> {
    const userId = await this.resolveUserId(user, tenantId);
    await this.projectService.findOneForUser({ projectId, tenantId, userId });
  }

  private async resolveUserId(user: UserContext, tenantId: string): Promise<string> {
    const row = await this.userService.getOrCreateUser(
      {
        keycloakId: user.userId,
        email: user.email ?? undefined,
        displayName: user.displayName ?? undefined,
      },
      tenantId
    );
    return row.id;
  }
}
