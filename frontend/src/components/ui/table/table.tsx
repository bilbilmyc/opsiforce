import { splitProps, type JSX, type ParentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function Table(props: ParentProps<JSX.HTMLAttributes<HTMLTableElement>>) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <div class="relative w-full overflow-auto">
      <table class={cn('w-full caption-bottom text-sm', local.class)} {...rest}>
        {local.children}
      </table>
    </div>
  );
}
