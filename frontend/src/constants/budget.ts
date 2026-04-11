export const DURATION_OPTIONS = [
  { value: "1d", label: "Daily" },
  { value: "1w", label: "Weekly" },
  { value: "1M", label: "Monthly" },
  { value: "1Y", label: "Yearly" },
]

export interface BudgetConfig {
  maxBudget: number | null
  budgetDuration: string | null
  currentUsage: number
}

export function durationLabel(duration: string | null): string {
  return DURATION_OPTIONS.find((d) => d.value === duration)?.label ?? "Monthly"
}
