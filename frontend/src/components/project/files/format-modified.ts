import { intlLocale } from '~/i18n';
export function formatModified(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(intlLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}
