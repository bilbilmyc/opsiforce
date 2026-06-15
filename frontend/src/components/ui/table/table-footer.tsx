import { splitProps, type JSX, type ParentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function TableFooter(props: ParentProps<JSX.HTMLAttributes<HTMLTableSectionElement>>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <tfoot class={cn('border-t bg-muted/40 font-medium [&>tr]:last:border-b-0', local.class)} {...rest}>
      {local.children}
    </tfoot>
  );
}
