import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lstat, readdir, rm } from 'fs/promises';
import path from 'path';
import {
  GENERATED_FILES_DIRECTORY_NAME,
  resolveFilePathWithinRoot,
  resolveWorkspaceRoot,
  USER_UPLOADS_DIRECTORY_NAME,
  WORKSPACE_LISTING_PATH_POLICY,
} from './file-paths';
import type { FileEntry, FilesListing, FilesSection } from './files.types';
import { canDeleteWorkspacePath, isListedWorkspacePath } from './workspace-file-policy';

const SECTION_DIRECTORY_NAMES = new Set([USER_UPLOADS_DIRECTORY_NAME, GENERATED_FILES_DIRECTORY_NAME]);

@Injectable()
export class FilesService {
  private readonly storageMountPath: string;
  private readonly logger = new Logger(FilesService.name);

  constructor(private readonly configService: ConfigService) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
  }

  async list(directory: string, requestedPath: string | undefined): Promise<FilesListing> {
    const root = resolveWorkspaceRoot(this.storageMountPath, directory);
    const requested = normalizeRequestedPath(requestedPath);
    const target = requested ? resolveFilePathWithinRoot(root, requested, WORKSPACE_LISTING_PATH_POLICY) : root;
    const relativePath = path.relative(root, target);
    const rootInfo = await this.fileInfo(root);
    if (!rootInfo?.isDirectory()) throw new NotFoundException('Workspace directory not found');

    if (!relativePath) {
      return { kind: 'root', path: '', sections: await this.listRoot(root) };
    }

    if (!isListedWorkspacePath(relativePath, true)) throw new NotFoundException('Directory not found');
    await this.assertNoSymlinks(root, relativePath);
    const info = await this.fileInfo(target);
    if (!info) throw new NotFoundException('Directory not found');
    if (!info.isDirectory()) throw new BadRequestException('Not a directory');
    return { kind: 'directory', path: relativePath, entries: await this.collectEntries(target, relativePath) };
  }

  async remove(directory: string, requestedPath: string | undefined): Promise<void> {
    const relativePath = normalizeRequestedPath(requestedPath);
    if (!relativePath) throw new BadRequestException('Missing file path');

    const root = resolveWorkspaceRoot(this.storageMountPath, directory);
    const target = resolveFilePathWithinRoot(root, relativePath, WORKSPACE_LISTING_PATH_POLICY);
    const canonicalPath = path.relative(root, target);
    if (!canDeleteWorkspacePath(canonicalPath)) throw new BadRequestException('Path is not deletable');
    await this.assertNoSymlinks(root, canonicalPath);
    const info = await this.fileInfo(target);
    if (!info) throw new NotFoundException('File not found');

    await rm(target, { recursive: info.isDirectory() });
  }

  private async listRoot(root: string): Promise<FilesSection[]> {
    const [generated, uploads, other] = await Promise.all([
      this.readSectionDirectory(root, GENERATED_FILES_DIRECTORY_NAME),
      this.readSectionDirectory(root, USER_UPLOADS_DIRECTORY_NAME),
      this.readWorkspaceStrays(root),
    ]);

    return [
      { key: 'generated', path: GENERATED_FILES_DIRECTORY_NAME, entries: generated },
      { key: 'uploads', path: USER_UPLOADS_DIRECTORY_NAME, entries: uploads },
      { key: 'other', path: '', entries: other },
    ];
  }

  private async readSectionDirectory(root: string, name: string): Promise<FileEntry[]> {
    const target = path.join(root, name);
    const info = await this.fileInfo(target);
    if (!info || info.isSymbolicLink()) return [];
    if (!info.isDirectory()) throw new BadRequestException('File section is not a directory');
    return this.collectEntries(target, name);
  }

  private async readWorkspaceStrays(root: string): Promise<FileEntry[]> {
    const entries = await this.collectEntries(root, '');
    return entries.filter((entry) => !SECTION_DIRECTORY_NAMES.has(entry.name));
  }

  private async fileInfo(target: string) {
    return lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      return this.readFailure(error);
    });
  }

  private readFailure(error: NodeJS.ErrnoException): never {
    this.logger.warn(`Workspace listing failed (${error.code ?? 'unknown filesystem error'})`);
    throw new ServiceUnavailableException('Could not load workspace files');
  }

  private async assertNoSymlinks(root: string, relativePath: string): Promise<void> {
    let target = root;
    for (const segment of relativePath.split('/')) {
      target = path.join(target, segment);
      const info = await this.fileInfo(target);
      if (!info || info.isSymbolicLink()) throw new NotFoundException('File or directory not found');
    }
  }

  private async collectEntries(target: string, relativePath: string): Promise<FileEntry[]> {
    const dirents = await readdir(target, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') throw new NotFoundException('Directory not found');
      return this.readFailure(error);
    });

    const entries = await Promise.all(
      dirents.map(async (dirent) => {
        const entryPath = relativePath ? `${relativePath}/${dirent.name}` : dirent.name;
        if (!isListedWorkspacePath(entryPath, dirent.isDirectory())) return null;
        if (dirent.isSymbolicLink()) return null;
        if (!dirent.isFile() && !dirent.isDirectory()) return null;

        const info = await this.fileInfo(path.join(target, dirent.name));
        if (!info || info.isSymbolicLink()) return null;

        return {
          name: dirent.name,
          path: entryPath,
          type: dirent.isDirectory() ? 'directory' : 'file',
          size: dirent.isDirectory() ? 0 : info.size,
          modifiedAt: info.mtime.toISOString(),
          canDelete: canDeleteWorkspacePath(entryPath),
        } satisfies FileEntry;
      })
    );

    return entries.filter((entry): entry is FileEntry => entry !== null).toSorted(compareEntries);
  }
}

function normalizeRequestedPath(requestedPath: string | undefined): string {
  if (!requestedPath) return '';
  const trimmed = requestedPath.replace(/^\/+|\/+$/g, '');
  return trimmed === '.' ? '' : trimmed;
}

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
  return a.name.localeCompare(b.name);
}
