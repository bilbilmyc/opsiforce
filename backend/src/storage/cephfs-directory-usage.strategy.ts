import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { measureInBatches, type DirectoryUsageStrategy } from './directory-usage.strategy';
import type { ClaimQuota, DirectoryUsage } from './platform-storage.types';

const run = promisify(execFile);

const RECURSIVE_BYTES_XATTR = 'ceph.dir.rbytes';
const QUOTA_MAX_BYTES_XATTR = 'ceph.quota.max_bytes';
const MISSING_XATTR_STDERR = 'no such attribute';
const XATTR_CONCURRENCY = 16;
const XATTR_MAX_BUFFER = 64 * 1024;

@Injectable()
export class CephfsDirectoryUsageStrategy implements DirectoryUsageStrategy {
  private readonly logger = new Logger(CephfsDirectoryUsageStrategy.name);
  private readonly storageMountPath: string;

  constructor(private readonly configService: ConfigService) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
  }

  measure(relativeDirectories: string[]): Promise<Map<string, DirectoryUsage>> {
    return measureInBatches(relativeDirectories, XATTR_CONCURRENCY, (directory) => this.measureOne(directory));
  }

  async claimQuota(): Promise<ClaimQuota> {
    try {
      const bytes = await this.readNumericXattr(this.storageMountPath, QUOTA_MAX_BYTES_XATTR);
      return bytes === 0 ? { state: 'absent' } : { state: 'enforced', bytes };
    } catch (err) {
      if (isMissingXattr(err as XattrError)) return { state: 'absent' };
      const mount = this.storageMountPath;
      this.logger.warn(`Could not read ${QUOTA_MAX_BYTES_XATTR} on ${mount}: ${(err as Error).message}`);
      return { state: 'unreadable' };
    }
  }

  private async measureOne(relativeDirectory: string): Promise<DirectoryUsage> {
    const absolutePath = path.join(this.storageMountPath, relativeDirectory);
    try {
      return { bytes: await this.readNumericXattr(absolutePath, RECURSIVE_BYTES_XATTR), error: false };
    } catch (err) {
      if (await isMissingPath(absolutePath)) return { bytes: 0, error: false };
      this.logger.warn(`Failed to read ${RECURSIVE_BYTES_XATTR} for ${relativeDirectory}: ${(err as Error).message}`);
      return { bytes: null, error: true };
    }
  }

  private async readNumericXattr(absolutePath: string, name: string): Promise<number> {
    const { stdout } = await run('getfattr', ['--only-values', '-n', name, absolutePath], {
      maxBuffer: XATTR_MAX_BUFFER,
    });
    const bytes = Number.parseInt(stdout.trim(), 10);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error(`${name} returned ${JSON.stringify(stdout)}`);
    return bytes;
  }
}

interface XattrError extends Error {
  stderr?: string;
}

function isMissingXattr(err: XattrError): boolean {
  return typeof err.stderr === 'string' && err.stderr.toLowerCase().includes(MISSING_XATTR_STDERR);
}

async function isMissingPath(absolutePath: string): Promise<boolean> {
  return lstat(absolutePath).then(
    () => false,
    (err: NodeJS.ErrnoException) => err.code === 'ENOENT'
  );
}
