import { Body, Controller, Delete, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Readable } from 'node:stream';
import { ProjectImportUploadService } from './project-import-upload.service';
import type { CreateImportUploadDto, CreateImportUploadResult } from './project-import.types';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { RequirePermission } from '../permission/permission.guard';
import { Perms } from '../permission/permission.constants';

const CHUNK_DIGEST_HEADER = 'x-chunk-sha256';

interface ChunkRequest extends FastifyRequest {
  body: Readable;
}

@Controller('projects/import/uploads')
export class ProjectImportUploadController {
  constructor(private readonly uploadService: ProjectImportUploadService) {}

  @Post()
  @RequirePermission(Perms.importProject)
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateImportUploadDto | undefined
  ): Promise<CreateImportUploadResult> {
    return this.uploadService.createSession(tenant.tenantId, dto?.size);
  }

  @Put(':uploadId/chunks/:index')
  @RequirePermission(Perms.importProject)
  @HttpCode(204)
  async putChunk(
    @Param('uploadId') uploadId: string,
    @Param('index') index: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: ChunkRequest
  ): Promise<void> {
    await this.uploadService.writeChunk({
      tenantId: tenant.tenantId,
      uploadId,
      index,
      digestHeader: firstHeader(req.headers[CHUNK_DIGEST_HEADER]),
      contentLengthHeader: req.headers['content-length'],
      body: req.body,
    });
  }

  @Delete(':uploadId')
  @RequirePermission(Perms.importProject)
  @HttpCode(204)
  async cancel(@Param('uploadId') uploadId: string, @CurrentTenant() tenant: TenantContext): Promise<void> {
    await this.uploadService.deleteSession({ tenantId: tenant.tenantId, uploadId });
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
