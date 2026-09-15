import { environmentDisplayName } from '~/lib/environment-label';
import { t } from '~/i18n';
import { Show, createSignal } from 'solid-js';
import { toast } from 'solid-sonner';
import { Lock, Pencil, Trash2, X } from '~/components/icons';
import { Button } from '~/components/ui/button';
import { ColorPicker } from '~/components/ui/color-picker';
import { useUpdateEnvironment, type Environment, type UpdateEnvironmentDto } from '~/api/environments';
import { EnvironmentBadge } from '~/components/environment-badge';
import { isEnvironmentShortNameValid } from '~/lib/environment-label';
import { BadgeLabelInput } from './badge-label-input';

export interface EnvironmentRowProps {
  environment: Environment;
  onRequestDelete: (environment: Environment) => void;
}

export function EnvironmentRow(props: EnvironmentRowProps) {
  const update = useUpdateEnvironment();
  const [editing, setEditing] = createSignal(false);
  const [name, setName] = createSignal('');
  const [shortName, setShortName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [color, setColor] = createSignal('');

  const isLocked = () => props.environment.isProtected;

  const shortNameValid = () => isEnvironmentShortNameValid(shortName());

  const startEdit = () => {
    setName(props.environment.name);
    setShortName(props.environment.shortName ?? '');
    setDescription(props.environment.description ?? '');
    setColor(props.environment.color);
    setEditing(true);
  };

  const save = async () => {
    const trimmed = name().trim();
    if (!isLocked() && !trimmed) return;
    if (!shortNameValid()) return;
    try {
      const dto: UpdateEnvironmentDto = { color: color(), shortName: shortName().trim() || null };
      if (!isLocked()) {
        dto.name = trimmed;
        dto.description = description().trim();
      }
      await update.mutateAsync({ id: props.environment.id, dto });
      toast.success(t("Environment updated"));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to update environment"));
    }
  };

  return (
    <div class="rounded-md border border-border bg-background p-2.5">
      <Show
        when={editing()}
        fallback={
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span
                  class="size-3.5 shrink-0 rounded-full border border-black/10"
                  style={{ 'background-color': props.environment.color }}
                  aria-hidden="true"
                />
                <span class="text-xs font-medium text-foreground">{environmentDisplayName(props.environment)}</span>
                <span
                  class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  title={t("URL slug — appears in every app URL of this environment")}
                >
                  {props.environment.slug}
                </span>
                <span class="inline-flex items-center" title={t("Badge shown on project cards")}>
                  <EnvironmentBadge environment={props.environment} class="h-5 px-1.5 text-[10px]" />
                </span>
                <Show when={isLocked()}>
                  <span class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Lock class="h-2.5 w-2.5" />{t("Protected")}</span>
                </Show>
              </div>
              <Show when={props.environment.description}>
                {(description) => <p class="mt-0.5 truncate text-xs text-muted-foreground">{props.environment.isProtected ? t(description()) : description()}</p>}
              </Show>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={startEdit}
                class="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t("Edit")}
                aria-label={t("Edit environment")}
              >
                <Pencil class="h-3 w-3" />
              </button>
              <Show when={!isLocked()}>
                <button
                  type="button"
                  onClick={() => props.onRequestDelete(props.environment)}
                  class="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title={t("Delete")}
                  aria-label={t("Delete environment")}
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </Show>
            </div>
          </div>
        }
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-foreground">{t("Edit environment")}</span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              class="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("Cancel")}
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
          <Show
            when={!isLocked()}
            fallback={
              <p class="text-xs text-muted-foreground">
                {environmentDisplayName(props.environment)}{t(" is protected — its name and slug are locked, but you can change its badge label and color.")}</p>
            }
          >
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name().trim()) save();
              }}
              class="h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t("Name")}
              autofocus
            />
            <input
              type="text"
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              class="h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t("Description (optional)")}
            />
          </Show>
          <div class="space-y-1">
            <span class="text-xs text-muted-foreground">{t("Badge label")}</span>
            <BadgeLabelInput
              value={shortName()}
              onInput={setShortName}
              onEnter={save}
              placeholder={t("e.g. PROD")}
              hint={
                <p class="text-xs text-muted-foreground">{t("Shown on project cards. Leave empty to derive it from the slug.")}</p>
              }
            />
          </div>
          <div class="space-y-1">
            <span class="text-xs text-muted-foreground">{t("Color")}</span>
            <ColorPicker value={color()} onChange={setColor} />
          </div>
          <div class="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>{t("Cancel")}</Button>
            <Button
              size="sm"
              onClick={save}
              loading={update.isPending}
              disabled={(!isLocked() && !name().trim()) || !shortNameValid()}
            >{t("Save")}</Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
