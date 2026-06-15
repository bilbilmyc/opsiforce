import { Switch as Kobalte } from '@kobalte/core/switch';
import { splitProps, type ComponentProps, type ParentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function SwitchLabel(props: ParentProps<ComponentProps<typeof Kobalte.Label>>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <Kobalte.Label class={cn('text-xs font-medium text-foreground mr-2', local.class)} {...rest}>
      {local.children}
    </Kobalte.Label>
  );
}
