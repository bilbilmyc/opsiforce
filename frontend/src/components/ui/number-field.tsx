import { NumberField as Kobalte } from "@kobalte/core/number-field"
import { splitProps, type ParentProps, type ComponentProps } from "solid-js"
import { cn } from "~/lib/cn"

function NumberField(props: ComponentProps<typeof Kobalte>) {
  const [local, rest] = splitProps(props, ["class"])
  return <Kobalte class={cn("flex flex-col gap-1", local.class)} {...rest} />
}

function NumberFieldLabel(props: ParentProps<ComponentProps<typeof Kobalte.Label>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Kobalte.Label class={cn("text-xs text-muted-foreground", local.class)} {...rest}>
      {local.children}
    </Kobalte.Label>
  )
}

function NumberFieldGroup(props: ParentProps<ComponentProps<"div">>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div class={cn("relative flex items-center", local.class)} {...rest}>
      {local.children}
    </div>
  )
}

function NumberFieldInput(props: ComponentProps<typeof Kobalte.Input>) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <Kobalte.Input
      class={cn(
        "w-full text-xs bg-background border border-input rounded-md px-2.5 py-1.5 pr-7 outline-none tabular-nums",
        "focus:ring-1 focus:ring-ring",
        "text-foreground placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        local.class,
      )}
      {...rest}
    />
  )
}

function NumberFieldIncrementTrigger(props: ParentProps<ComponentProps<typeof Kobalte.IncrementTrigger>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Kobalte.IncrementTrigger
      class={cn(
        "absolute right-px top-px flex h-[calc(50%-1px)] w-6 items-center justify-center rounded-tr-md",
        "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
        "disabled:pointer-events-none disabled:opacity-30",
        local.class,
      )}
      {...rest}
    >
      {local.children ?? (
        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      )}
    </Kobalte.IncrementTrigger>
  )
}

function NumberFieldDecrementTrigger(props: ParentProps<ComponentProps<typeof Kobalte.DecrementTrigger>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Kobalte.DecrementTrigger
      class={cn(
        "absolute right-px bottom-px flex h-[calc(50%-1px)] w-6 items-center justify-center rounded-br-md",
        "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
        "disabled:pointer-events-none disabled:opacity-30",
        local.class,
      )}
      {...rest}
    >
      {local.children ?? (
        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      )}
    </Kobalte.DecrementTrigger>
  )
}

export {
  NumberField,
  NumberFieldLabel,
  NumberFieldGroup,
  NumberFieldInput,
  NumberFieldIncrementTrigger,
  NumberFieldDecrementTrigger,
}
