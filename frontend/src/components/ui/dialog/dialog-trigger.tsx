import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { splitProps, type ComponentProps, type ParentProps } from "solid-js"
import { cn } from "~/lib/cn"

export function DialogTrigger(
  props: ParentProps<ComponentProps<typeof Kobalte.Trigger>>,
) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Kobalte.Trigger class={cn("outline-none", local.class)} {...rest}>
      {local.children}
    </Kobalte.Trigger>
  )
}
