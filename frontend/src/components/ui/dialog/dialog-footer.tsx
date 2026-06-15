import { splitProps, type JSX, type ParentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function DialogFooter(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div class={cn('flex flex-col-reverse gap-2 mt-4 sm:flex-row sm:justify-end', local.class)} {...rest}>
      {local.children}
    </div>
  );
}
