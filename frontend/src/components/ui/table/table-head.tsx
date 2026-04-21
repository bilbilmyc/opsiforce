import { splitProps, type JSX, type ParentProps } from "solid-js"
import { cn } from "~/lib/cn"

export function TableHead(
  props: ParentProps<JSX.ThHTMLAttributes<HTMLTableCellElement>>,
) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <th
      class={cn(
        "h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </th>
  )
}
