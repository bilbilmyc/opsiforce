import { Show } from 'solid-js';
import {
  TextField,
  TextFieldLabel,
  TextFieldInput,
  TextFieldDescription,
  TextFieldErrorMessage,
} from '~/components/ui/text-field';

export function LabeledTextField(props: {
  label: string;
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  mono?: boolean;
  autofocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <TextField value={props.value} onChange={props.onInput} validationState={props.error ? 'invalid' : 'valid'}>
      <TextFieldLabel>{props.label}</TextFieldLabel>
      <TextFieldInput
        placeholder={props.placeholder}
        autofocus={props.autofocus}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === 'Enter') props.onEnter?.();
        }}
        class={props.mono ? 'font-mono placeholder:font-sans' : undefined}
      />
      <Show
        when={props.error}
        fallback={
          <Show when={props.hint}>
            <TextFieldDescription>{props.hint}</TextFieldDescription>
          </Show>
        }
      >
        <TextFieldErrorMessage>{props.error}</TextFieldErrorMessage>
      </Show>
    </TextField>
  );
}
