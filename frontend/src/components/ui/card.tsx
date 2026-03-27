import { splitProps, type JSX, type ParentProps } from "solid-js"
import { cn } from "~/lib/cn"

function Card(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div class={cn("rounded-xl border bg-card text-card-foreground shadow-sm", local.class)} {...rest}>
      {local.children}
    </div>
  )
}

function CardHeader(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div class={cn("flex flex-col space-y-1.5 p-4", local.class)} {...rest}>
      {local.children}
    </div>
  )
}

function CardTitle(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div class={cn("font-semibold leading-none tracking-tight", local.class)} {...rest}>
      {local.children}
    </div>
  )
}

function CardDescription(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div class={cn("text-sm text-muted-foreground", local.class)} {...rest}>
      {local.children}
    </div>
  )
}

function CardContent(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div class={cn("p-4 pt-0", local.class)} {...rest}>
      {local.children}
    </div>
  )
}

function CardFooter(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <div class={cn("flex items-center p-4 pt-0", local.class)} {...rest}>
      {local.children}
    </div>
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
