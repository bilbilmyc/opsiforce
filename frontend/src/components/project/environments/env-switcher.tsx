import { Show } from "solid-js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Layers } from "~/components/icons"
import type { ProjectEnvironment } from "~/api/environments"
import EnvStatusDot from "./env-status-dot"

export interface EnvSwitcherProps {
  environments: ProjectEnvironment[]
  activeEnvironmentId: string
  onChange: (environmentId: string) => void
}

export default function EnvSwitcher(props: EnvSwitcherProps) {
  const active = () => props.environments.find((e) => e.id === props.activeEnvironmentId)

  return (
    <Select<ProjectEnvironment>
      options={props.environments}
      optionValue="id"
      optionTextValue="name"
      value={active()}
      onChange={(env) => env && props.onChange(env.id)}
      itemComponent={(itemProps) => (
        <SelectItem item={itemProps.item} class="gap-2">
          <span class="flex items-center gap-2">
            <EnvStatusDot status={itemProps.item.rawValue.status} />
            <span class="truncate">{itemProps.item.rawValue.name}</span>
          </span>
        </SelectItem>
      )}
    >
      <SelectTrigger class="h-8 w-auto min-w-44 gap-2" aria-label="Active environment">
        <span class="flex items-center gap-2 min-w-0">
          <Layers class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <SelectValue<ProjectEnvironment> class="flex items-center gap-2 min-w-0">
            {(state) => (
              <Show when={state.selectedOption()}>
                {(env) => (
                  <span class="flex items-center gap-2 min-w-0">
                    <EnvStatusDot status={env().status} />
                    <span class="truncate font-medium text-foreground">{env().name}</span>
                  </span>
                )}
              </Show>
            )}
          </SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent class="min-w-52" />
    </Select>
  )
}
