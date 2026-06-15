import { Dialog as Kobalte } from '@kobalte/core/dialog';
import { splitProps, type ComponentProps, type ParentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function DialogTitle(props: ParentProps<ComponentProps<typeof Kobalte.Title>>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <Kobalte.Title class={cn('text-sm font-semibold text-foreground pr-8', local.class)} {...rest}>
      {local.children}
    </Kobalte.Title>
  );
}
