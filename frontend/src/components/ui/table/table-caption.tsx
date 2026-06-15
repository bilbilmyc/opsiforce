import { splitProps, type JSX, type ParentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function TableCaption(props: ParentProps<JSX.HTMLAttributes<HTMLTableCaptionElement>>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <caption class={cn('mt-4 text-xs text-muted-foreground', local.class)} {...rest}>
      {local.children}
    </caption>
  );
}
