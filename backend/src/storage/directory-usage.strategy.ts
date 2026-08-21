import type { ClaimQuota, DirectoryUsage } from './platform-storage.types';

export const DIRECTORY_USAGE_STRATEGY = 'DIRECTORY_USAGE_STRATEGY';

export interface DirectoryUsageStrategy {
  measure(relativeDirectories: string[]): Promise<Map<string, DirectoryUsage>>;
  claimQuota(): Promise<ClaimQuota>;
}

export async function measureInBatches(
  relativeDirectories: string[],
  concurrency: number,
  measureOne: (relativeDirectory: string) => Promise<DirectoryUsage>
): Promise<Map<string, DirectoryUsage>> {
  const measured = new Map<string, DirectoryUsage>();
  const queue = [...new Set(relativeDirectories)];

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const usages = await Promise.all(batch.map((directory) => measureOne(directory)));
    batch.forEach((directory, index) => measured.set(directory, usages[index]));
  }

  return measured;
}
