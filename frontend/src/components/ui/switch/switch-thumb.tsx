import { Switch as Kobalte } from "@kobalte/core/switch"
import { splitProps, type ComponentProps } from "solid-js"
import { cn } from "~/lib/cn"

export function SwitchThumb(props: ComponentProps<typeof Kobalte.Thumb>) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <Kobalte.Thumb
      class={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
        "data-[checked]:translate-x-4 translate-x-0",
        local.class,
      )}
      {...rest}
    />
  )
}
