import { Dialog as Kobalte } from '@kobalte/core/dialog';
import { splitProps, Show, type ComponentProps, type ParentProps } from 'solid-js';
import { X } from '~/components/icons';
import { cn } from '~/lib/cn';

type DialogContentProps = ParentProps<ComponentProps<typeof Kobalte.Content> & { hideClose?: boolean }>;

export function DialogContent(props: DialogContentProps) {
  const [local, rest] = splitProps(props, ['class', 'children', 'hideClose']);
  return (
    <Kobalte.Portal>
      <Kobalte.Overlay
        class={cn(
          'fixed inset-0 z-50 bg-black/50',
          'data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0'
        )}
      />
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <Kobalte.Content
          class={cn(
            'relative z-50 w-full max-w-md rounded-lg border border-border bg-popover p-6 shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
            'data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95',
            local.class
          )}
          {...rest}
        >
          {local.children}
          <Show when={!local.hideClose}>
            <Kobalte.CloseButton
              class={cn(
                'absolute right-3 top-3 inline-flex items-center justify-center rounded-md w-7 h-7',
                'text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              )}
              aria-label="Close"
            >
              <X class="w-4 h-4" />
            </Kobalte.CloseButton>
          </Show>
        </Kobalte.Content>
      </div>
    </Kobalte.Portal>
  );
}
