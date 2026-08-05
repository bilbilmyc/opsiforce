import { TextField as Kobalte } from '@kobalte/core/text-field';
import { splitProps, type ComponentProps } from 'solid-js';
import { cn } from '~/lib/cn';

export function TextFieldInput(props: ComponentProps<typeof Kobalte.Input>) {
  const [local, rest] = splitProps(props, ['class']);
  return (
    <Kobalte.Input
      class={cn(
        'h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        local.class
      )}
      {...rest}
    />
  );
}
