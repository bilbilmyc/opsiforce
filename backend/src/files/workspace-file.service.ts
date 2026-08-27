import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { open, type FileHandle } from 'fs/promises';
import { basename } from 'path';
import {
  hasHiddenSegment,
  resolveFilePathWithinRoot,
  resolveOpenedFileRelativePath,
  resolveWorkspaceRoot,
  WORKSPACE_FILE_PATH_POLICY,
} from './file-paths';

export interface OpenedWorkspaceFile {
  handle: FileHandle;
  name: string;
  size: number;
}

@Injectable()
export class WorkspaceFileService {
  private readonly storageMountPath: string;

  constructor(private readonly configService: ConfigService) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
  }

  async openForRead(directory: string, relativePath: string): Promise<OpenedWorkspaceFile> {
    const root = resolveWorkspaceRoot(this.storageMountPath, directory);
    const filePath = resolveFilePathWithinRoot(root, relativePath, WORKSPACE_FILE_PATH_POLICY);

    const handle = await open(filePath, 'r').catch(() => null);
    if (!handle) throw new NotFoundException('File not found');

    const info = await handle.stat().catch(() => null);
    const realRelativePath = await resolveOpenedFileRelativePath(root, handle.fd);
    if (!info || !info.isFile() || realRelativePath === null || hasHiddenSegment(realRelativePath)) {
      await handle.close().catch(() => {});
      throw new NotFoundException('File not found');
    }

    return { handle, name: basename(filePath), size: info.size };
  }
}
