import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { splitProps, type ParentProps, type ComponentProps } from "solid-js"
import { cn } from "~/lib/cn"

function Dialog(props: ComponentProps<typeof Kobalte>) {
  return <Kobalte {...props} />
}

function DialogTrigger(props: ParentProps<ComponentProps<typeof Kobalte.Trigger>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Kobalte.Trigger class={cn("outline-none", local.class)} {...rest}>
      {local.children}
    </Kobalte.Trigger>
  )
}

function DialogContent(props: ParentProps<ComponentProps<typeof Kobalte.Content>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Kobalte.Portal>
      <Kobalte.Overlay
        class={cn(
          "fixed inset-0 z-50 bg-black/50",
          "data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0",
        )}
      />
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <Kobalte.Content
          class={cn(
            "z-50 w-full max-w-md rounded-lg border border-border bg-popover p-6 shadow-lg",
            "animate-in fade-in-0 zoom-in-95",
            "data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
            local.class,
          )}
          {...rest}
        >
          {local.children}
        </Kobalte.Content>
      </div>
    </Kobalte.Portal>
  )
}

function DialogTitle(props: ParentProps<ComponentProps<typeof Kobalte.Title>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Kobalte.Title class={cn("text-sm font-semibold text-foreground", local.class)} {...rest}>
      {local.children}
    </Kobalte.Title>
  )
}

function DialogDescription(props: ParentProps<ComponentProps<typeof Kobalte.Description>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Kobalte.Description class={cn("text-xs text-muted-foreground mt-1", local.class)} {...rest}>
      {local.children}
    </Kobalte.Description>
  )
}

function DialogClose(props: ParentProps<ComponentProps<typeof Kobalte.CloseButton>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Kobalte.CloseButton class={cn("outline-none", local.class)} {...rest}>
      {local.children}
    </Kobalte.CloseButton>
  )
}

export { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose }
