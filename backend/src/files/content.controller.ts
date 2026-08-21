import { BadRequestException, Controller, Get, Logger, Param, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { contentDisposition, resolveContentType, resolveDisposition, resolveSandboxPolicy } from './file-content-types';
import { SingleQuery } from './single-query.decorator';
import { streamWorkspaceFile, type ByteRange } from './file-stream';
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspaceFileService } from './workspace-file.service';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { CurrentUser, type UserContext } from '../user/user.decorator';

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

@Controller('projects')
export class ContentController {
  private readonly logger = new Logger(ContentController.name);

  constructor(
    private readonly workspaceFileService: WorkspaceFileService,
    private readonly workspaceAccessService: WorkspaceAccessService
  ) {}

  @Get(':projectId/files/content')
  async content(
    @Param('projectId') projectId: string,
    @SingleQuery('path') requestedPath: string | undefined,
    @SingleQuery('environmentId') environmentId: string | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply
  ): Promise<void> {
    if (!requestedPath) throw new BadRequestException('Missing file path');

    const directory = await this.workspaceAccessService.resolveDirectory(projectId, environmentId, tenant, user);
    const file = await this.workspaceFileService.openForRead(directory, requestedPath);

    const range = parseByteRange(req.headers.range, file.size);
    if (range === 'unsatisfiable') {
      await file.handle.close().catch(() => {});
      await reply
        .status(416)
        .header('Content-Range', `bytes */${file.size}`)
        .header('Cache-Control', 'no-store')
        .send();
      return;
    }

    this.workspaceAccessService.touchActivity(projectId, environmentId);

    const contentType = resolveContentType(file.name);
    const headers: Record<string, string | number> = {
      'Content-Type': contentType,
      'Content-Disposition': contentDisposition(file.name, resolveDisposition(contentType)),
      'Content-Length': range ? range.end - range.start + 1 : file.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.size}`;

    const sandboxPolicy = resolveSandboxPolicy(contentType);
    if (sandboxPolicy) headers['Content-Security-Policy'] = sandboxPolicy;

    streamWorkspaceFile({
      req,
      reply,
      handle: file.handle,
      name: file.name,
      status: range ? 206 : 200,
      headers,
      range: range ?? undefined,
      logger: this.logger,
    });
  }
}

function parseByteRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null;

  const match = RANGE_PATTERN.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  if (size === 0) return 'unsatisfiable';

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (suffixLength === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(rawStart);
  if (start >= size) return 'unsatisfiable';

  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  if (end < start) return 'unsatisfiable';
  return { start, end };
}
