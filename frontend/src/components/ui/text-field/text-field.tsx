import { TextField as Kobalte } from '@kobalte/core/text-field';
import { splitProps, type ComponentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function TextField(props: ComponentProps<typeof Kobalte>) {
  const [local, rest] = splitProps(props, ['class']);
  return <Kobalte class={cn('flex flex-col gap-1', local.class)} {...rest} />;
}
