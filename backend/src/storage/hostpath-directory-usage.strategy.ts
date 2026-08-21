import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lstat, readdir } from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import path from 'node:path';
import { measureInBatches, type DirectoryUsageStrategy } from './directory-usage.strategy';
import type { ClaimQuota, DirectoryUsage } from './platform-storage.types';

const WALK_CONCURRENCY = 8;

@Injectable()
export class HostPathDirectoryUsageStrategy implements DirectoryUsageStrategy {
  private readonly logger = new Logger(HostPathDirectoryUsageStrategy.name);
  private readonly storageMountPath: string;

  constructor(private readonly configService: ConfigService) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
  }

  measure(relativeDirectories: string[]): Promise<Map<string, DirectoryUsage>> {
    return measureInBatches(relativeDirectories, WALK_CONCURRENCY, (directory) => this.measureOne(directory));
  }

  claimQuota(): Promise<ClaimQuota> {
    return Promise.resolve({ state: 'absent' });
  }

  private async measureOne(relativeDirectory: string): Promise<DirectoryUsage> {
    try {
      return { bytes: await this.walk(path.join(this.storageMountPath, relativeDirectory)), error: false };
    } catch (err) {
      this.logger.warn(`Failed to measure ${relativeDirectory}: ${(err as Error).message}`);
      return { bytes: null, error: true };
    }
  }

  private async walk(absolutePath: string): Promise<number> {
    const pending = [absolutePath];
    let bytes = 0;

    while (pending.length > 0) {
      const directory = pending.pop();
      if (directory === undefined) break;
      const entries = await readdir(directory, { withFileTypes: true }).catch(skipMissing<Dirent[]>([]));

      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          pending.push(entryPath);
          continue;
        }
        const stats = await lstat(entryPath).catch(skipMissing<Stats | null>(null));
        if (stats) bytes += stats.size;
      }
    }

    return bytes;
  }
}

function skipMissing<T>(fallback: T): (err: NodeJS.ErrnoException) => T {
  return (err) => {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  };
}
