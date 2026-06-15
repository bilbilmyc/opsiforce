import { Dialog as Kobalte } from '@kobalte/core/dialog';
import { splitProps, type ComponentProps, type ParentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function DialogClose(props: ParentProps<ComponentProps<typeof Kobalte.CloseButton>>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <Kobalte.CloseButton class={cn('outline-none', local.class)} {...rest}>
      {local.children}
    </Kobalte.CloseButton>
  );
}
