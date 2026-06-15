import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { realpath } from 'fs/promises';
import path from 'path';

const MAX_PATH_COMPONENT_LENGTH = 255;

const CONTENT_TYPES: Record<string, string> = {
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

@Injectable()
export class DownloadService {
  private readonly storageMountPath: string;

  constructor(private readonly configService: ConfigService) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
  }

  resolveWorkspacePath(directory: string, relativePath: string): string {
    const sanitized = this.sanitizePath(relativePath);
    const root = path.resolve(this.storageMountPath, directory);
    const fullPath = path.resolve(root, sanitized);
    if (fullPath !== root && !fullPath.startsWith(root + path.sep)) {
      throw new BadRequestException('Path traversal not allowed');
    }
    return fullPath;
  }

  async isWithinWorkspace(directory: string, fullPath: string): Promise<boolean> {
    try {
      const root = await realpath(path.resolve(this.storageMountPath, directory));
      const real = await realpath(fullPath);
      return real === root || real.startsWith(root + path.sep);
    } catch {
      return false;
    }
  }

  contentType(filename: string): string {
    return CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
  }

  private sanitizePath(relativePath: string): string {
    if (!relativePath) throw new BadRequestException('Empty file path');
    if (relativePath.includes('\0')) throw new BadRequestException('Null bytes not allowed');
    const withoutPrefix = relativePath.replace(/^\/?workspace\//, '');
    const normalized = path.normalize(withoutPrefix).replace(/\\/g, '/');
    if (normalized === '.' || normalized === '') throw new BadRequestException('Empty file path');
    if (path.isAbsolute(normalized)) throw new BadRequestException('Absolute paths not allowed');
    for (const segment of normalized.split('/')) {
      if (segment === '..') throw new BadRequestException('Path traversal not allowed');
      if (segment.startsWith('.')) throw new BadRequestException('Hidden files are not downloadable');
      if (Buffer.byteLength(segment) > MAX_PATH_COMPONENT_LENGTH) throw new BadRequestException('Filename too long');
    }
    return normalized;
  }
}
