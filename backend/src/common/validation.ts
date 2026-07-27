import { BadRequestException } from '@nestjs/common';

// An idle timeout must outlast several websocket keep-alive touches, or an open
// connection's TTL can expire between two touches and suspend the pod
// mid-connection. The proxy touches every OPSIFORCE_PROXY_WS_KEEPALIVE_INTERVAL
// (default 1m), so this floor keeps five touches inside the shortest timeout.
export const MIN_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function assertPositiveMs(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${field} must be a positive millisecond value`);
  }
  return Math.round(value);
}

export function assertIdleTimeoutMs(value: number, field: string): number {
  const rounded = assertPositiveMs(value, field);
  if (rounded < MIN_IDLE_TIMEOUT_MS) {
    throw new BadRequestException(`${field} must be at least ${MIN_IDLE_TIMEOUT_MS / 60_000} minutes`);
  }
  return rounded;
}
