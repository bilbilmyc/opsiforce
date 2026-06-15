import { splitProps, type JSX, type ParentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function TableBody(props: ParentProps<JSX.HTMLAttributes<HTMLTableSectionElement>>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <tbody class={cn('[&_tr:last-child]:border-0', local.class)} {...rest}>
      {local.children}
    </tbody>
  );
}
