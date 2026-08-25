import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { constants } from 'fs';
import { lstat, mkdir, open, rename, unlink } from 'fs/promises';
import { pipeline, Readable, Transform } from 'stream';
import { promisify } from 'util';
import path from 'path';
import {
  isNearestExistingAncestorWithinRoot,
  isResolvedPathWithinRoot,
  resolveFilePathWithinRoot,
  resolveUserUploadsRoot,
  resolveWorkspaceRoot,
  UPLOAD_FILE_PATH_POLICY,
} from './file-paths';

const pipelineAsync = promisify(pipeline);

const STAGING_WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);

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
    if (!info) {
      if (!(await isNearestExistingAncestorWithinRoot(uploadsRoot, target))) {
        throw new BadRequestException('Upload target must be inside user uploads');
      }
      return target;
    }
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
    containmentRoot: string,
    filePath: string,
    fileStream: Readable,
    onProgress?: (bytesWritten: number) => void
  ): Promise<{ size: number }> {
    const directory = path.dirname(filePath);
    await mkdir(directory, { recursive: true });
    if (!(await isResolvedPathWithinRoot(containmentRoot, directory))) {
      throw new BadRequestException('Upload target must be inside user uploads');
    }
    let size = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        onProgress?.(size);
        this.push(chunk);
        cb();
      },
    });
    // Staged beside the target and renamed on success, so a failed replacement cannot destroy the existing file.
    const stagingPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.part`);
    const handle = await open(stagingPath, STAGING_WRITE_FLAGS);
    try {
      await pipelineAsync(fileStream, counter, handle.createWriteStream({ autoClose: false }));
      await rename(stagingPath, filePath);
    } catch (err) {
      await unlink(stagingPath).catch(() => {});
      throw err;
    } finally {
      await handle.close().catch(() => {});
    }
    return { size };
  }
}
