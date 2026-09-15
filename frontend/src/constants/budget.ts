import { t } from '~/i18n';
export const DURATION_OPTIONS = [
  { value: '1d', get label() { return t("Daily"); } },
  { value: '1w', get label() { return t("Weekly"); } },
  { value: '1M', get label() { return t("Monthly"); } },
  { value: '1Y', get label() { return t("Yearly"); } },
];

export interface BudgetConfig {
  maxBudget: number | null;
  budgetDuration: string | null;
  currentUsage: number;
}

export function durationLabel(duration: string | null): string {
  return DURATION_OPTIONS.find((d) => d.value === duration)?.label ?? t("Monthly");
}
