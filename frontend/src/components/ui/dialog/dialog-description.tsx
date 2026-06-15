import { Dialog as Kobalte } from '@kobalte/core/dialog';
import { splitProps, type ComponentProps, type ParentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function DialogDescription(props: ParentProps<ComponentProps<typeof Kobalte.Description>>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <Kobalte.Description class={cn('text-xs text-muted-foreground mt-1', local.class)} {...rest}>
      {local.children}
    </Kobalte.Description>
  );
}
