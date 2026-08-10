import { TextField as Kobalte } from '@kobalte/core/text-field';
import { splitProps, type ComponentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function TextFieldDescription(props: ComponentProps<typeof Kobalte.Description>) {
  const [local, rest] = splitProps(props, ['class']);
  return <Kobalte.Description class={cn('text-xs text-muted-foreground', local.class)} {...rest} />;
}
