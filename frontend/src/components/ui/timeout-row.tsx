import { Show } from 'solid-js';
import { TIME_UNITS } from '~/lib/duration-units';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '~/components/ui/select';
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  NumberFieldIncrementTrigger,
  NumberFieldDecrementTrigger,
} from '~/components/ui/number-field';

export function TimeoutRow(props: {
  label: string;
  description?: string;
  placeholder: string;
  value: string;
  unit: string;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: string) => void;
}) {
  const unitOption = () => TIME_UNITS.find((u) => u.value === props.unit) ?? null;

  return (
    <div class="rounded-lg border border-border p-3 space-y-2.5">
      <span class="text-xs font-medium text-foreground block">{props.label}</span>
      <Show when={props.description}>
        <p class="text-xs text-muted-foreground/70">{props.description}</p>
      </Show>
      <div class="flex items-end gap-2">
        <NumberField class="flex-1" minValue={1} step={1} value={props.value} onChange={(v) => props.onValueChange(v)}>
          <NumberFieldGroup>
            <NumberFieldInput placeholder={props.placeholder} />
            <NumberFieldIncrementTrigger />
            <NumberFieldDecrementTrigger />
          </NumberFieldGroup>
        </NumberField>
        <div class="w-28">
          <Select
            options={TIME_UNITS}
            optionValue="value"
            optionTextValue="label"
            value={unitOption()}
            onChange={(opt) => {
              if (opt) props.onUnitChange(opt.value);
            }}
            itemComponent={(itemProps) => (
              <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
            )}
          >
            <SelectTrigger>
              <SelectValue<(typeof TIME_UNITS)[0]>>
                {(state) => <span>{state.selectedOption()?.label ?? 'Minutes'}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
        </div>
      </div>
    </div>
  );
}
