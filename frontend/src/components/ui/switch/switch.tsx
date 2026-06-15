import { Switch as Kobalte } from '@kobalte/core/switch';
import { splitProps, type ComponentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function Switch(props: ComponentProps<typeof Kobalte>) {
  const [local, rest] = splitProps(props, ['class']);
  return <Kobalte class={cn('inline-flex items-center', local.class)} {...rest} />;
}

export { Kobalte as KobalteSwitch };
