import { Injectable, BadRequestException, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createWriteStream } from "fs"
import { mkdir, unlink } from "fs/promises"
import { execFile } from "child_process"
import { pipeline, Readable, Transform } from "stream"
import { promisify } from "util"
import path from "path"

const pipelineAsync = promisify(pipeline)
const execFileAsync = promisify(execFile)

const MAX_PATH_COMPONENT_LENGTH = 255

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name)
  private readonly storageMountPath: string
  private readonly storageType: "cephfs" | "hostPath"
  private readonly k8sNamespace: string

  constructor(private readonly configService: ConfigService) {
    this.storageMountPath = this.configService.get<string>(
      "storageMountPath",
      "/tmp/opsiforce-data",
    )
    this.storageType = this.configService.get<"cephfs" | "hostPath">(
      "storageType",
      "cephfs",
    )
    this.k8sNamespace = this.configService.get<string>(
      "k8sNamespace",
      "opsiforce",
    )
  }

  resolveUploadPath(directory: string, relativePath: string): string {
    const sanitized = this.sanitizePath(relativePath)
    const expectedBase = path.resolve(
      this.storageMountPath,
      directory,
      "user_uploaded_files",
    )
    const fullPath = path.resolve(expectedBase, sanitized)
    if (!fullPath.startsWith(expectedBase + path.sep) && fullPath !== expectedBase)
      throw new BadRequestException("Path traversal not allowed")
    return fullPath
  }

  async streamFileToDisk(
    filePath: string,
    fileStream: Readable,
  ): Promise<{ size: number }> {
    await mkdir(path.dirname(filePath), { recursive: true })
    let size = 0
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length
        this.push(chunk)
        cb()
      },
    })
    try {
      await pipelineAsync(fileStream, counter, createWriteStream(filePath))
    } catch (err) {
      await unlink(filePath).catch(() => {})
      throw err
    }
    return { size }
  }

  async syncToPod(
    localPath: string,
    podName: string,
    relativePath: string,
  ): Promise<void> {
    if (this.storageType !== "hostPath") return

    const remotePath = `/workspace/user_uploaded_files/${relativePath}`
    const remoteDir = path.posix.dirname(remotePath)

    await execFileAsync("kubectl", [
      "exec", "-n", this.k8sNamespace, podName, "-c", "opencode",
      "--", "mkdir", "-p", remoteDir,
    ])
    await execFileAsync("kubectl", [
      "cp", localPath,
      `${this.k8sNamespace}/${podName}:${remotePath}`,
      "-c", "opencode",
    ])
  }

  private sanitizePath(relativePath: string): string {
    if (!relativePath) throw new BadRequestException("Empty file path")
    if (relativePath.includes("\0"))
      throw new BadRequestException("Null bytes not allowed")
    const normalized = path.normalize(relativePath).replace(/\\/g, "/")
    if (normalized === "." || normalized === "")
      throw new BadRequestException("Empty file path")
    if (path.isAbsolute(normalized))
      throw new BadRequestException("Absolute paths not allowed")
    for (const segment of normalized.split("/")) {
      if (segment === "..")
        throw new BadRequestException("Path traversal not allowed")
      if (Buffer.byteLength(segment) > MAX_PATH_COMPONENT_LENGTH)
        throw new BadRequestException("Filename too long")
    }
    return normalized
  }
}
