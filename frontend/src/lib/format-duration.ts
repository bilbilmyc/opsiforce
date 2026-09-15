import { intlLocale } from '~/i18n';
import { t } from '~/i18n';
export function formatDuration(ms: number): string {
  if (ms <= 0) return t('{0}s', { 0: 0 });
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days) parts.push(t("{0}d", { 0: days }));
  if (hours) parts.push(t("{0}h", { 0: hours }));
  if (minutes) parts.push(t("{0}m", { 0: minutes }));
  if (parts.length === 0) parts.push(t("{0}s", { 0: seconds }));
  return parts.slice(0, 2).join(' ');
}

export function formatAgo(ms: number): string {
  if (ms < 5000) return t('just now');
  return t("{0} ago", { "0": formatDuration(ms) });
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleString(intlLocale());
}
