import { t } from '~/i18n';
import { For, Show, type JSX } from 'solid-js';
import { type Agent } from '~/api/client';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '~/components/ui/dropdown-menu';
import { Boxes, Bot, FolderPlus, Package } from '~/components/icons';
import { FOLDER_DESCRIPTION } from '~/components/folder-dialog';
import { cn } from '~/lib/cn';

export function CreateMenu(props: {
  trigger: (triggerProps: Record<string, unknown>) => JSX.Element;
  agents: Agent[] | undefined;
  disabled?: boolean;
  canCreateProject?: boolean;
  canCreateWorkspace?: boolean;
  canImport?: boolean;
  onCreateProject: (agentId: string) => void;
  onOpenCreateWorkspace?: () => void;
  onOpenCreateFolder?: () => void;
  onOpenImport?: () => void;
}) {
  const canCreateProject = () => props.canCreateProject ?? true;
  const hasSecondary = () => !!props.canCreateWorkspace || !!props.onOpenCreateFolder || !!props.canImport;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger as={props.trigger} />
      <DropdownMenuContent class="w-72">
        <Show when={canCreateProject()}>
          <MenuDividerLabel class="mb-1 mt-1">{t("Choose an agent")}</MenuDividerLabel>
          <Show
            when={(props.agents ?? []).length > 0}
            fallback={<div class="px-2 py-1.5 text-xs italic text-muted-foreground">{t("No agents available")}</div>}
          >
            <For each={props.agents}>
              {(agent) => (
                <RichMenuItem
                  icon={<Bot class="w-4 h-4" />}
                  title={t(agent.displayName ?? agent.name)}
                  description={t(agent.description ?? "Start a new project with this agent.")}
                  disabled={props.disabled}
                  onSelect={() => props.onCreateProject(agent.id)}
                />
              )}
            </For>
          </Show>
          <Show when={hasSecondary()}>
            <MenuDividerLabel>{t("OR")}</MenuDividerLabel>
          </Show>
        </Show>
        <Show when={props.canCreateWorkspace}>
          <RichMenuItem
            compact
            icon={<Boxes class="w-3.5 h-3.5" />}
            title={t("Create new workspace")}
            description={t("A shared space to group projects and manage access.")}
            onSelect={() => props.onOpenCreateWorkspace?.()}
          />
        </Show>
        <Show when={props.onOpenCreateFolder}>
          <RichMenuItem
            compact
            icon={<FolderPlus class="w-3.5 h-3.5" />}
            title={t("Create new folder")}
            description={FOLDER_DESCRIPTION}
            onSelect={() => props.onOpenCreateFolder?.()}
          />
        </Show>
        <Show when={props.canImport}>
          <RichMenuItem
            compact
            icon={<Package class="w-3.5 h-3.5" />}
            title={t("Import project")}
            description={t("Stand up a project from an export file.")}
            onSelect={() => props.onOpenImport?.()}
          />
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuDividerLabel(props: { children: JSX.Element; class?: string }) {
  return (
    <div class={cn('-mx-1 my-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground', props.class)}>
      <span class="h-px flex-1 bg-border" />
      <span class="shrink-0">{props.children}</span>
      <span class="h-px flex-1 bg-border" />
    </div>
  );
}

function RichMenuItem(props: {
  icon: JSX.Element;
  title: string;
  description: string;
  compact?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      class={cn('items-start gap-2.5', props.compact ? 'py-1.5' : 'py-2')}
      disabled={props.disabled}
      onSelect={props.onSelect}
    >
      <span class="mt-0.5 shrink-0 text-muted-foreground">{props.icon}</span>
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class={cn('font-medium leading-none text-foreground', props.compact ? 'text-xs' : 'text-sm')}>
          {props.title}
        </span>
        <span class="text-xs leading-snug text-muted-foreground">{props.description}</span>
      </span>
    </DropdownMenuItem>
  );
}
