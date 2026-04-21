import { Show } from "solid-js"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/select"
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  NumberFieldIncrementTrigger,
  NumberFieldDecrementTrigger,
} from "~/components/ui/number-field"
import { DURATION_OPTIONS } from "~/constants/budget"

export interface BudgetRowProps {
  label: string
  draftBudget: string
  draftDuration: string
  onBudgetChange: (value: string) => void
  onDurationChange: (value: string) => void
  currentBudget?: number | null
  currentSpend?: number
}

export function BudgetRow(props: BudgetRowProps) {
  const durationOption = () => DURATION_OPTIONS.find((d) => d.value === props.draftDuration) ?? null
  const hasBudget = () => props.currentBudget != null && props.currentBudget > 0
  const pct = () => {
    const max = props.currentBudget
    if (max == null || max <= 0) return 0
    return Math.min(((props.currentSpend ?? 0) / max) * 100, 100)
  }

  return (
    <div class="rounded-lg border border-border p-3 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-foreground">{props.label}</span>
        <Show when={hasBudget()}>
          <span class="text-xs tabular-nums text-muted-foreground">
            ${(props.currentSpend ?? 0).toFixed(2)} / ${props.currentBudget}
          </span>
        </Show>
      </div>

      <Show when={hasBudget()}>
        <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            class="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct()}%` }}
          />
        </div>
      </Show>

      <div class="flex items-end gap-2">
        <NumberField
          class="flex-1"
          minValue={0}
          step={1}
          value={props.draftBudget}
          onChange={(v) => props.onBudgetChange(v)}
        >
          <label class="text-xs text-muted-foreground mb-1 block">Max budget (USD)</label>
          <NumberFieldGroup>
            <NumberFieldInput placeholder="0 = unlimited" />
            <NumberFieldIncrementTrigger />
            <NumberFieldDecrementTrigger />
          </NumberFieldGroup>
        </NumberField>
        <div class="w-28">
          <label class="text-xs text-muted-foreground mb-1 block">Period</label>
          <Select
            options={DURATION_OPTIONS}
            optionValue="value"
            optionTextValue="label"
            value={durationOption()}
            onChange={(opt) => { if (opt) props.onDurationChange(opt.value) }}
            itemComponent={(itemProps) => (
              <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
            )}
          >
            <SelectTrigger>
              <SelectValue<typeof DURATION_OPTIONS[0]>>
                {(state) => <span>{state.selectedOption()?.label ?? "Select"}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
        </div>
      </div>
    </div>
  )
}
