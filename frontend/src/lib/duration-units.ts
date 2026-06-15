export const TIME_UNITS = [
  { value: 'minutes', label: 'Minutes', multiplier: 60 * 1000 },
  { value: 'hours', label: 'Hours', multiplier: 60 * 60 * 1000 },
  { value: 'days', label: 'Days', multiplier: 24 * 60 * 60 * 1000 },
];

export function msToUnit(ms: number): { value: string; unit: string } {
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;
  if (ms >= day && ms % day === 0) return { value: String(ms / day), unit: 'days' };
  if (ms >= hour && ms % hour === 0) return { value: String(ms / hour), unit: 'hours' };
  return { value: String(ms / minute), unit: 'minutes' };
}

export function unitToMs(value: string, unit: string, fallback: number): number {
  const num = parseFloat(value);
  if (!num || num <= 0) return fallback;
  const u = TIME_UNITS.find((t) => t.value === unit);
  return Math.round(num * (u?.multiplier ?? 1));
}
