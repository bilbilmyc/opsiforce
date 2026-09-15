import { t } from '~/i18n';
import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { LoaderCircle, Package, Upload } from '~/components/icons';
import { PUBLIC_LABEL, useWorkspaces } from '~/api/workspaces';
import { useDefaultProjectTarget } from '~/api/default-project-target';
import { createImportUploadSession } from '~/api/import';
import { useJobDock } from '~/components/project/jobs/job-dock-context';

export interface ProjectImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWorkspaceId?: string | null;
  defaultFolder?: { id: string; name: string } | null;
}

export function ProjectImportDialog(props: ProjectImportDialogProps) {
  const workspaces = useWorkspaces();
  const defaultTarget = useDefaultProjectTarget();
  const jobDock = useJobDock();

  const [file, setFile] = createSignal<File | null>(null);
  const [title, setTitle] = createSignal('');
  const [workspaceId, setWorkspaceId] = createSignal<string | null>(null);
  const [starting, setStarting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let workspaceInitialized = false;
  createEffect(() => {
    if (props.defaultWorkspaceId !== undefined) return;
    const target = defaultTarget();
    if (target.kind === 'unknown') return;

    const selectable = workspaces.data;
    const selected = workspaceId();
    const selectionStillOffered =
      workspaceInitialized && (selected === null || !selectable || selectable.some((w) => w.id === selected));
    if (selectionStillOffered) return;

    workspaceInitialized = true;
    setWorkspaceId(target.kind === 'public' ? null : target.workspaceId);
  });

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (open && props.defaultWorkspaceId !== undefined) {
          setWorkspaceId(props.defaultWorkspaceId);
        }
      }
    )
  );

  const folder = createMemo(() => {
    const target = props.defaultFolder;
    if (!target) return null;
    return workspaceId() === (props.defaultWorkspaceId ?? null) ? target : null;
  });

  const reset = () => {
    setFile(null);
    setTitle('');
    setStarting(false);
    setError(null);
  };

  const close = () => {
    props.onOpenChange(false);
    reset();
  };

  const submit = async () => {
    const chosen = file();
    if (!chosen) return;
    setStarting(true);
    setError(null);
    try {
      const session = await createImportUploadSession(chosen.size);
      jobDock.startImportUpload({
        file: chosen,
        uploadId: session.uploadId,
        chunkSize: session.chunkSize,
        title: title(),
        workspaceId: workspaceId(),
        folderId: folder()?.id ?? null,
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Failed to start import"));
      setStarting(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open || starting()) return;
        close();
      }}
    >
      <DialogContent class="max-w-lg" hideClose={starting()}>
        <DialogTitle class="flex items-center gap-2">
          <Package class="h-4 w-4 text-primary" />{t("Import project")}</DialogTitle>
        <DialogDescription>{t("Stand up a project from an export file as a new, independent project. The file may contain live environment variable values and the full conversation — only import files you trust.")}</DialogDescription>

        <Show
          when={!starting()}
          fallback={
            <div class="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle class="h-4 w-4 animate-spin text-primary" />{t("Starting import…")}</div>
          }
        >
          <div class="mt-4 space-y-3">
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">{t("Export file")}</label>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
                class="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-accent"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">{t("Workspace")}</label>
              <select
                value={workspaceId() ?? ''}
                onChange={(e) => setWorkspaceId(e.currentTarget.value || null)}
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <For each={workspaces.data ?? []}>{(ws) => <option value={ws.id}>{ws.name}</option>}</For>
                <option value="">{PUBLIC_LABEL}</option>
              </select>
              <Show when={props.defaultFolder}>
                {(target) => (
                  <p class="mt-1 text-xs text-muted-foreground">
                    <Show
                      when={folder()}
                      fallback={t("Imports into the workspace root — {0} belongs to another workspace.", { "0": target().name })}
                    >{t("Imports into the ")}{target().name}{t(" folder.")}</Show>
                  </p>
                )}
              </Show>
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">{t("Title (optional)")}</label>
              <input
                type="text"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder={t("Carried from the export file")}
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        </Show>

        <Show when={error()}>
          <div class="mt-2 text-xs text-destructive">{error()}</div>
        </Show>

        <Show when={!starting()}>
          <div class="mt-5 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={close}>{t("Cancel")}</Button>
            <Button size="sm" onClick={submit} disabled={!file()}>
              <Upload class="h-3.5 w-3.5" />{t("Import")}</Button>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
