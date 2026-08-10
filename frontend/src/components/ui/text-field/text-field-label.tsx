import { TextField as Kobalte } from '@kobalte/core/text-field';
import { splitProps, type ComponentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function TextFieldLabel(props: ComponentProps<typeof Kobalte.Label>) {
  const [local, rest] = splitProps(props, ['class']);
  return <Kobalte.Label class={cn('text-xs text-muted-foreground', local.class)} {...rest} />;
}
