import { Injectable } from '@nestjs/common';

export interface AppReadinessState {
  serving: boolean;
  live: boolean;
}

interface Waiter {
  resolve: (ready: boolean) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_STATE: AppReadinessState = { serving: false, live: false };

@Injectable()
export class AppReadinessService {
  private readonly states = new Map<string, AppReadinessState>();
  private readonly waiters = new Map<string, Set<Waiter>>();

  getState(key: string): AppReadinessState {
    return this.states.get(key) ?? DEFAULT_STATE;
  }

  markServing(key: string): void {
    this.states.set(key, { serving: true, live: false });
    this.resolveWaiters(key);
  }

  markLive(key: string): void {
    this.states.set(key, { serving: true, live: true });
    this.resolveWaiters(key);
  }

  markDown(key: string): void {
    this.states.set(key, { serving: false, live: false });
  }

  awaitReady(key: string, timeoutMs: number): Promise<boolean> {
    if (this.getState(key).serving) return Promise.resolve(true);

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
