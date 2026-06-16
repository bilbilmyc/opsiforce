import { createSignal, onCleanup } from 'solid-js';

export function useNow(intervalMs = 1000): () => number {
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), intervalMs);
  onCleanup(() => clearInterval(timer));
  return now;
}

export function elapsedSince(now: number, since: number): number {
  return Math.max(0, now - since);
}
