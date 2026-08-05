import { timingSafeEqual } from 'crypto';

export function timingSafeStringEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  if (expectedBytes.byteLength !== actualBytes.byteLength) return false;
  return timingSafeEqual(expectedBytes, actualBytes);
}
