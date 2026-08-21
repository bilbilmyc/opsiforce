import { Injectable } from '@nestjs/common';
import { PlatformStorageSnapshotService } from './platform-storage-snapshot.service';
import type { PlatformStorageView } from './platform-storage.types';

const MEMO_TTL_MS = 30_000;

@Injectable()
export class PlatformStorageService {
  private memo: { expiresAt: number; snapshot: Promise<PlatformStorageView> } | null = null;

  constructor(private readonly snapshotService: PlatformStorageSnapshotService) {}

  snapshot(): Promise<PlatformStorageView> {
    const now = Date.now();
    if (this.memo && this.memo.expiresAt > now) return this.memo.snapshot;

    const entry = { expiresAt: now + MEMO_TTL_MS, snapshot: this.snapshotService.build() };
    this.memo = entry;
    entry.snapshot.catch(() => {
      if (this.memo === entry) this.memo = null;
    });
    return entry.snapshot;
  }
}
