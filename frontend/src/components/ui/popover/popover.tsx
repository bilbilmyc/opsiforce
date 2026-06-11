import { Popover as Kobalte } from "@kobalte/core/popover"
import type { ComponentProps } from "solid-js"

export function Popover(props: ComponentProps<typeof Kobalte>) {
  return <Kobalte gutter={8} {...props} />
}
