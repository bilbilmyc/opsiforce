import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { LoaderCircle, Package, Upload } from '~/components/icons';
import { useCurrentUser } from '~/api/user';
import { PUBLIC_LABEL, useWorkspaces } from '~/api/workspaces';
import { startProjectImport } from '~/api/import';
import { useJobDock } from '~/components/project/jobs/job-dock-context';

export interface ProjectImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectImportDialog(props: ProjectImportDialogProps) {
  const currentUser = useCurrentUser();
  const workspaces = useWorkspaces();
  const jobDock = useJobDock();

  const [file, setFile] = createSignal<File | null>(null);
  const [title, setTitle] = createSignal('');
  const [workspaceId, setWorkspaceId] = createSignal<string | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const privateWorkspace = createMemo(() => {
    const uid = currentUser.data?.id;
    if (!uid) return undefined;
    return (workspaces.data ?? []).find((w) => w.type === 'private' && w.ownerId === uid);
  });

  createEffect(() => {
    if (workspaceId() === null && privateWorkspace()) setWorkspaceId(privateWorkspace()?.id ?? null);
  });

  const reset = () => {
    setFile(null);
    setTitle('');
    setUploading(false);
    setError(null);
  };

  const close = () => {
    props.onOpenChange(false);
    reset();
  };

  const submit = async () => {
    const chosen = file();
    if (!chosen) return;
    setUploading(true);
    setError(null);
    try {
      const result = await startProjectImport({ file: chosen, workspaceId: workspaceId(), title: title() });
      jobDock.trackImport({
        projectId: result.projectId,
        title: title().trim() || 'Imported project',
        job: result.job,
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start import');
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open || uploading()) return;
        close();
      }}
    >
      <DialogContent class="max-w-lg" hideClose={uploading()}>
        <DialogTitle class="flex items-center gap-2">
          <Package class="h-4 w-4 text-primary" />
          Import project
        </DialogTitle>
        <DialogDescription>
          Stand up a project from an export file as a new, independent project. The file may contain live environment
          variable values and the full conversation — only import files you trust.
        </DialogDescription>

        <Show
          when={!uploading()}
          fallback={
            <div class="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle class="h-4 w-4 animate-spin text-primary" />
              Uploading export file…
            </div>
          }
        >
          <div class="mt-4 space-y-3">
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">Export file</label>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
                class="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-accent"
              />
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">Workspace</label>
              <select
                value={workspaceId() ?? ''}
                onChange={(e) => setWorkspaceId(e.currentTarget.value || null)}
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <For each={workspaces.data ?? []}>{(ws) => <option value={ws.id}>{ws.name}</option>}</For>
                <option value="">{PUBLIC_LABEL}</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-muted-foreground mb-1 block">Title (optional)</label>
              <input
                type="text"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder="Carried from the export file"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        </Show>

        <Show when={error()}>
          <div class="mt-2 text-xs text-destructive">{error()}</div>
        </Show>

        <Show when={!uploading()}>
          <div class="mt-5 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={!file()}>
              <Upload class="h-3.5 w-3.5" />
              Import
            </Button>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
