import { TextField as Kobalte } from '@kobalte/core/text-field';
import { splitProps, type ComponentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function TextFieldErrorMessage(props: ComponentProps<typeof Kobalte.ErrorMessage>) {
  const [local, rest] = splitProps(props, ['class']);
  return <Kobalte.ErrorMessage class={cn('text-xs text-destructive', local.class)} {...rest} />;
}
