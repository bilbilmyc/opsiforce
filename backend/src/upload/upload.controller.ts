import { Controller, Post, Param, Req, Res } from "@nestjs/common"
import type { MultipartFile } from "@fastify/multipart"
import { FastifyRequest, FastifyReply } from "fastify"
import { unlink } from "fs/promises"
import { UploadService } from "./upload.service"
import { ProjectService } from "../project/project.service"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"

interface MultipartRequest extends FastifyRequest {
  parts(): AsyncIterableIterator<MultipartFile | { type: "field" }>
}

@Controller("projects")
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly projectService: ProjectService,
  ) {}

  @Post(":projectId/upload")
  async upload(
    @Param("projectId") projectId: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: MultipartRequest,
    @Res() reply: FastifyReply,
  ) {
    const project = await this.projectService.findOne(projectId, tenant.tenantId)
    this.projectService.touchActivity(projectId).catch(() => {})

    const results: Array<{ path: string; size: number }> = []
    const parts = req.parts()
    let truncatedFile: string | null = null

    for await (const part of parts) {
      if (part.type !== "file") continue

      if (truncatedFile) {
        part.file.resume()
        continue
      }

      const relativePath = part.fieldname
      const destPath = this.uploadService.resolveUploadPath(
        project.directory,
        relativePath,
      )
      const { size } = await this.uploadService.streamFileToDisk(
        destPath,
        part.file,
      )

      if (part.file.truncated) {
        await unlink(destPath).catch(() => {})
        truncatedFile = relativePath
        continue
      }

      if (project.podName) {
        await this.uploadService
          .syncToPod(destPath, project.podName, relativePath)
          .catch(() => {})
      }

      results.push({ path: relativePath, size })
    }

    if (truncatedFile) {
      reply.status(413).send({
        error: `File too large: ${truncatedFile}`,
        maxSize: "100MB",
      })
      return
    }

    reply.send({ uploaded: results.length, files: results })
  }
}
