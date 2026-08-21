import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream } from 'fs';
import { lstat, mkdir, unlink } from 'fs/promises';
import { pipeline, Readable, Transform } from 'stream';
import { promisify } from 'util';
import path from 'path';
import {
  isResolvedPathWithinRoot,
  resolveFilePathWithinRoot,
  resolveUserUploadsRoot,
  resolveWorkspaceRoot,
  UPLOAD_FILE_PATH_POLICY,
} from './file-paths';

const pipelineAsync = promisify(pipeline);

@Injectable()
export class UploadService {
  private readonly storageMountPath: string;

  constructor(private readonly configService: ConfigService) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
  }

  async resolveUploadTargetDirectory(directory: string, targetPath: string | undefined): Promise<string> {
    const uploadsRoot = resolveUserUploadsRoot(this.storageMountPath, directory);
    const requested = targetPath?.replace(/^\/+|\/+$/g, '');
    if (!requested || requested === '.') return uploadsRoot;

    const target = resolveFilePathWithinRoot(
      resolveWorkspaceRoot(this.storageMountPath, directory),
      requested,
      UPLOAD_FILE_PATH_POLICY
    );
    if (target !== uploadsRoot && !target.startsWith(uploadsRoot + path.sep)) {
      throw new BadRequestException('Upload target must be inside user uploads');
    }

    const info = await lstat(target).catch(() => null);
    if (!info) return target;
    if (!info.isDirectory()) throw new BadRequestException('Upload target is not a directory');
    if (!(await isResolvedPathWithinRoot(uploadsRoot, target))) {
      throw new BadRequestException('Upload target must be inside user uploads');
    }
    return target;
  }

  resolveUploadPath(targetDirectory: string, relativePath: string): string {
    return resolveFilePathWithinRoot(targetDirectory, relativePath, UPLOAD_FILE_PATH_POLICY);
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
}
