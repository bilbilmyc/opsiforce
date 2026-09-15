import { t } from '~/i18n';
import { Show } from 'solid-js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '~/components/ui/select';
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  NumberFieldIncrementTrigger,
  NumberFieldDecrementTrigger,
} from '~/components/ui/number-field';
import type { RequestLogMode } from '~/api/client';

interface LogModeOption {
  value: RequestLogMode;
  label: string;
  description: string;
}

const LOG_MODES: LogModeOption[] = [
  {
    value: 'off',
    get label() { return t("Off"); },
    get description() { return t("No request logging. Lowest overhead — best for high-traffic apps."); },
  },
  {
    value: 'metadata',
    get label() { return t("Metadata only"); },
    get description() { return t("Log method, path, status, latency and size. No request or response bodies."); },
  },
  {
    value: 'full',
    get label() { return t("Full"); },
    get description() { return t("Log metadata plus truncated request and response bodies."); },
  },
];

const FULL_MODE = LOG_MODES[2];

export function RequestLoggingControls(props: {
  mode: RequestLogMode;
  bodyLimitKb: string;
  onModeChange: (mode: RequestLogMode) => void;
  onBodyLimitKbChange: (kb: string) => void;
}) {
  const modeOption = () => LOG_MODES.find((m) => m.value === props.mode) ?? FULL_MODE;

  return (
    <div class="rounded-lg border border-border p-3 space-y-3">
      <div class="space-y-2.5">
        <span class="text-xs font-medium text-foreground block">{t("Logging Level")}</span>
        <Select
          options={LOG_MODES}
          optionValue="value"
          optionTextValue="label"
          value={modeOption()}
          onChange={(opt) => {
            if (opt) props.onModeChange(opt.value);
          }}
          itemComponent={(itemProps) => <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>}
        >
          <SelectTrigger>
            <SelectValue<LogModeOption>>
              {(state) => <span>{state.selectedOption()?.label ?? FULL_MODE.label}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>
        <p class="text-xs text-muted-foreground/70">{modeOption().description}</p>
      </div>

      <Show when={props.mode === 'full'}>
        <div class="space-y-2.5 border-t border-border pt-3">
          <span class="text-xs font-medium text-foreground block">{t("Body Capture Limit (KB)")}</span>
          <p class="text-xs text-muted-foreground/70">{t("Maximum size of each request and response body kept in the log. Larger bodies are truncated at capture time, so they never buffer in the proxy. Max 3 MB.")}</p>
          <NumberField
            class="w-32"
            minValue={0}
            maxValue={3072}
            step={1}
            value={props.bodyLimitKb}
            onChange={(v) => props.onBodyLimitKbChange(v)}
          >
            <NumberFieldGroup>
              <NumberFieldInput placeholder="256" />
              <NumberFieldIncrementTrigger />
              <NumberFieldDecrementTrigger />
            </NumberFieldGroup>
          </NumberField>
        </div>
      </Show>
    </div>
  );
}
