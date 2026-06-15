import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { pipeline, Readable, Transform } from 'stream';
import { promisify } from 'util';
import path from 'path';

const pipelineAsync = promisify(pipeline);

const MAX_PATH_COMPONENT_LENGTH = 255;

@Injectable()
export class UploadService {
  private readonly storageMountPath: string;

  constructor(private readonly configService: ConfigService) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
  }

  resolveUploadPath(directory: string, relativePath: string): string {
    const sanitized = this.sanitizePath(relativePath);
    const expectedBase = this.resolveUploadRoot(directory);
    const fullPath = path.resolve(expectedBase, sanitized);
    if (!fullPath.startsWith(expectedBase + path.sep) && fullPath !== expectedBase)
      throw new BadRequestException('Path traversal not allowed');
    return fullPath;
  }

  async streamFileToDisk(
    filePath: string,
    fileStream: Readable,
    onProgress?: (bytesWritten: number) => void
  ): Promise<{ size: number }> {
    await mkdir(path.dirname(filePath), { recursive: true });
    let size = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        onProgress?.(size);
        this.push(chunk);
        cb();
      },
    });
    try {
      await pipelineAsync(fileStream, counter, createWriteStream(filePath));
    } catch (err) {
      await unlink(filePath).catch(() => {});
      throw err;
    }
    return { size };
  }

  private sanitizePath(relativePath: string): string {
    if (!relativePath) throw new BadRequestException('Empty file path');
    if (relativePath.includes('\0')) throw new BadRequestException('Null bytes not allowed');
    const normalized = path.normalize(relativePath).replace(/\\/g, '/');
    if (normalized === '.' || normalized === '') throw new BadRequestException('Empty file path');
    if (path.isAbsolute(normalized)) throw new BadRequestException('Absolute paths not allowed');
    for (const segment of normalized.split('/')) {
      if (segment === '..') throw new BadRequestException('Path traversal not allowed');
      if (Buffer.byteLength(segment) > MAX_PATH_COMPONENT_LENGTH) throw new BadRequestException('Filename too long');
    }
    return normalized;
  }

  private resolveUploadRoot(directory: string): string {
    return path.resolve(this.storageMountPath, directory, 'user_uploaded_files');
  }
}
