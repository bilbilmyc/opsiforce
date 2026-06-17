import { Injectable } from '@nestjs/common';

interface Waiter {
  resolve: (ready: boolean) => void;
  timer: NodeJS.Timeout;
}

@Injectable()
export class AppReadinessService {
  private readonly serving = new Map<string, boolean>();
  private readonly waiters = new Map<string, Set<Waiter>>();

  markServing(key: string): void {
    this.serving.set(key, true);
    this.resolveWaiters(key);
  }

  markDown(key: string): void {
    this.serving.set(key, false);
  }

  clear(key: string): void {
    this.serving.delete(key);
    const waiters = this.waiters.get(key);
    if (!waiters) return;
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(false);
    }
    this.waiters.delete(key);
  }

  awaitReady(key: string, timeoutMs: number): Promise<boolean> {
    if (this.serving.get(key)) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      const waiters = this.waiters.get(key) ?? new Set<Waiter>();
      const waiter: Waiter = {
        resolve,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          if (waiters.size === 0) this.waiters.delete(key);
          resolve(false);
        }, timeoutMs),
      };
      waiters.add(waiter);
      this.waiters.set(key, waiters);
    });
  }

  private resolveWaiters(key: string): void {
    const waiters = this.waiters.get(key);
    if (!waiters) return;
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(true);
    }
    this.waiters.delete(key);
  }
}
