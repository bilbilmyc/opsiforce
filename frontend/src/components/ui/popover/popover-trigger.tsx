import { Popover as Kobalte } from "@kobalte/core/popover"
import { splitProps, type ComponentProps, type ParentProps } from "solid-js"
import { cn } from "~/lib/cn"

export function PopoverTrigger(props: ParentProps<ComponentProps<typeof Kobalte.Trigger>>) {
  const [local, rest] = splitProps(props, ["class"])
  return <Kobalte.Trigger class={cn("outline-none", local.class)} {...rest} />
}
