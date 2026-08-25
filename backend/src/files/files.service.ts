import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lstat, readdir, rm, stat } from 'fs/promises';
import path from 'path';
import {
  GENERATED_FILES_DIRECTORY_NAME,
  hasHiddenSegment,
  HIDDEN_ROOT_DIRECTORY_NAMES,
  isResolvedPathWithinRoot,
  resolveFilePathWithinRoot,
  resolveRealRelativePath,
  resolveWorkspaceRoot,
  USER_UPLOADS_DIRECTORY_NAME,
  WORKSPACE_LISTING_PATH_POLICY,
} from './file-paths';
import type { FileEntry, FilesListing, FilesSection } from './files.types';

const SECTION_DIRECTORY_NAMES = new Set([USER_UPLOADS_DIRECTORY_NAME, GENERATED_FILES_DIRECTORY_NAME]);

@Injectable()
export class FilesService {
  private readonly storageMountPath: string;

  constructor(private readonly configService: ConfigService) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
  }

  async list(directory: string, requestedPath: string | undefined): Promise<FilesListing> {
    const root = resolveWorkspaceRoot(this.storageMountPath, directory);
    const relativePath = normalizeRequestedPath(requestedPath);

    if (!relativePath) {
      return { kind: 'root', path: '', sections: await this.listRoot(root) };
    }

    const target = resolveFilePathWithinRoot(root, relativePath, WORKSPACE_LISTING_PATH_POLICY);
    if (isHiddenRootPath(relativePath)) throw new NotFoundException('Directory not found');

    return { kind: 'directory', path: relativePath, entries: await this.readDirectory(root, target, relativePath) };
  }

  async remove(directory: string, requestedPath: string | undefined): Promise<void> {
    const relativePath = normalizeRequestedPath(requestedPath);
    if (!relativePath) throw new BadRequestException('Missing file path');

    const root = resolveWorkspaceRoot(this.storageMountPath, directory);
    const target = resolveFilePathWithinRoot(root, relativePath, WORKSPACE_LISTING_PATH_POLICY);
    assertDeletablePath(path.relative(root, target));

    const info = await lstat(target).catch(() => null);
    if (!info || info.isSymbolicLink()) throw new NotFoundException('File not found');

    const resolvedRelativePath = await resolveRealRelativePath(root, target);
    if (!resolvedRelativePath) throw new NotFoundException('File not found');
    assertDeletablePath(resolvedRelativePath);

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
    if (!(await isResolvedPathWithinRoot(root, target))) return [];
    return this.collectEntries(target, name);
  }

  private async readWorkspaceStrays(root: string): Promise<FileEntry[]> {
    const entries = await this.collectEntries(root, '');
    return entries.filter(
      (entry) => !SECTION_DIRECTORY_NAMES.has(entry.name) && !HIDDEN_ROOT_DIRECTORY_NAMES.has(entry.name)
    );
  }

  private async readDirectory(root: string, target: string, relativePath: string): Promise<FileEntry[]> {
    if (!(await isResolvedPathWithinRoot(root, target))) throw new NotFoundException('Directory not found');

    const realRelativePath = await resolveRealRelativePath(root, target);
    if (realRelativePath === null || hasHiddenSegment(realRelativePath) || isHiddenRootPath(realRelativePath)) {
      throw new NotFoundException('Directory not found');
    }

    const info = await stat(target).catch(() => null);
    if (!info) throw new NotFoundException('Directory not found');
    if (!info.isDirectory()) throw new BadRequestException('Not a directory');
    return this.collectEntries(target, relativePath);
  }

  private async collectEntries(target: string, relativePath: string): Promise<FileEntry[]> {
    const dirents = await readdir(target, { withFileTypes: true }).catch(() => null);
    if (!dirents) return [];

    const entries = await Promise.all(
      dirents.map(async (dirent) => {
        if (dirent.name.startsWith('.')) return null;
        if (dirent.isSymbolicLink()) return null;
        if (!dirent.isFile() && !dirent.isDirectory()) return null;

        const info = await stat(path.join(target, dirent.name)).catch(() => null);
        if (!info) return null;

        return {
          name: dirent.name,
          path: relativePath ? `${relativePath}/${dirent.name}` : dirent.name,
          type: dirent.isDirectory() ? 'directory' : 'file',
          size: dirent.isDirectory() ? 0 : info.size,
          modifiedAt: info.mtime.toISOString(),
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

function assertDeletablePath(relativePath: string): void {
  const segments = relativePath.split('/');
  const [first] = segments;
  const isHidden = HIDDEN_ROOT_DIRECTORY_NAMES.has(first);
  const isSectionRootItself = segments.length === 1 && SECTION_DIRECTORY_NAMES.has(first);
  if (isHidden || isSectionRootItself) throw new BadRequestException('Path is not deletable');
}

function isHiddenRootPath(relativePath: string): boolean {
  const [first] = relativePath.split('/');
  return HIDDEN_ROOT_DIRECTORY_NAMES.has(first);
}

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
  return a.name.localeCompare(b.name);
}
