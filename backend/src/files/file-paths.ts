import { BadRequestException } from '@nestjs/common';
import { lstat, realpath } from 'fs/promises';
import path from 'path';

const MAX_PATH_COMPONENT_LENGTH = 255;
const WORKSPACE_LINK_PREFIX = /^\/?workspace\//;

export const USER_UPLOADS_DIRECTORY_NAME = 'user_uploaded_files';
export const GENERATED_FILES_DIRECTORY_NAME = 'generated_files';

export const HIDDEN_ROOT_DIRECTORY_NAMES = new Set(['app', 'node_modules', 'data']);

export interface FilePathPolicy {
  stripWorkspaceLinkPrefix: boolean;
  rejectHiddenSegments: boolean;
}

export const UPLOAD_FILE_PATH_POLICY: FilePathPolicy = {
  stripWorkspaceLinkPrefix: false,
  rejectHiddenSegments: false,
};

export const WORKSPACE_FILE_PATH_POLICY: FilePathPolicy = {
  stripWorkspaceLinkPrefix: true,
  rejectHiddenSegments: true,
};

export const WORKSPACE_LISTING_PATH_POLICY: FilePathPolicy = {
  stripWorkspaceLinkPrefix: false,
  rejectHiddenSegments: true,
};

export function resolveWorkspaceRoot(storageMountPath: string, directory: string): string {
  return path.resolve(storageMountPath, directory);
}

export function resolveUserUploadsRoot(storageMountPath: string, directory: string): string {
  return path.resolve(storageMountPath, directory, USER_UPLOADS_DIRECTORY_NAME);
}

export function sanitizeRelativeFilePath(relativePath: string, policy: FilePathPolicy): string {
  if (!relativePath) throw new BadRequestException('Empty file path');
  if (relativePath.includes('\0')) throw new BadRequestException('Null bytes not allowed');
  const withoutPrefix = policy.stripWorkspaceLinkPrefix
    ? relativePath.replace(WORKSPACE_LINK_PREFIX, '')
    : relativePath;
  const normalized = path.normalize(withoutPrefix).replace(/\\/g, '/');
  if (normalized === '.' || normalized === '') throw new BadRequestException('Empty file path');
  if (path.isAbsolute(normalized)) throw new BadRequestException('Absolute paths not allowed');
  for (const segment of normalized.split('/')) {
    if (segment === '..') throw new BadRequestException('Path traversal not allowed');
    if (policy.rejectHiddenSegments && segment.startsWith('.'))
      throw new BadRequestException('Hidden files are not downloadable');
    if (Buffer.byteLength(segment) > MAX_PATH_COMPONENT_LENGTH) throw new BadRequestException('Filename too long');
  }
  return normalized;
}

export function resolveFilePathWithinRoot(root: string, relativePath: string, policy: FilePathPolicy): string {
  const sanitized = sanitizeRelativeFilePath(relativePath, policy);
  const fullPath = path.resolve(root, sanitized);
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) {
    throw new BadRequestException('Path traversal not allowed');
  }
  return fullPath;
}

export async function isResolvedPathWithinRoot(root: string, target: string): Promise<boolean> {
  try {
    const realRoot = await realpath(root);
    const real = await realpath(target);
    return real === realRoot || real.startsWith(realRoot + path.sep);
  } catch {
    return false;
  }
}

export async function isOpenedFileWithinRoot(root: string, fd: number): Promise<boolean> {
  try {
    const realRoot = await realpath(root);
    const real = await realpath(`/proc/self/fd/${fd}`);
    return real === realRoot || real.startsWith(realRoot + path.sep);
  } catch {
    return false;
  }
}

export function hasHiddenSegment(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => segment.startsWith('.'));
}

export async function isNearestExistingAncestorWithinRoot(root: string, target: string): Promise<boolean> {
  let current = path.dirname(target);
  for (;;) {
    if (await lstat(current).catch(() => null)) return isResolvedPathWithinRoot(root, current);
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

export async function resolveRealRelativePath(root: string, target: string): Promise<string | null> {
  try {
    const realRoot = await realpath(root);
    const realParent = await realpath(path.dirname(target));
    const real = path.join(realParent, path.basename(target));
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return null;
    return path.relative(realRoot, real);
  } catch {
    return null;
  }
}
