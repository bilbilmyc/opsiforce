import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { LoaderCircle, Package, Upload } from '~/components/icons';
import { useCurrentUser } from '~/api/user';
import { PUBLIC_LABEL, useWorkspaces } from '~/api/workspaces';
import { createImportUploadSession } from '~/api/import';
import { useJobDock } from '~/components/project/jobs/job-dock-context';

export interface ProjectImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWorkspaceId?: string | null;
}

export function ProjectImportDialog(props: ProjectImportDialogProps) {
  const currentUser = useCurrentUser();
  const workspaces = useWorkspaces();
  const jobDock = useJobDock();

  const [file, setFile] = createSignal<File | null>(null);
  const [title, setTitle] = createSignal('');
  const [workspaceId, setWorkspaceId] = createSignal<string | null>(null);
  const [starting, setStarting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const privateWorkspace = createMemo(() => {
    const uid = currentUser.data?.id;
    if (!uid) return undefined;
    return (workspaces.data ?? []).find((w) => w.type === 'private' && w.ownerId === uid);
  });

  let workspaceInitialized = false;
  createEffect(() => {
    if (props.defaultWorkspaceId !== undefined) return;
    const ws = privateWorkspace();
    if (!workspaceInitialized && ws) {
      workspaceInitialized = true;
      setWorkspaceId(ws.id);
    }
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
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start import');
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
          <Package class="h-4 w-4 text-primary" />
          Import project
        </DialogTitle>
        <DialogDescription>
          Stand up a project from an export file as a new, independent project. The file may contain live environment
          variable values and the full conversation — only import files you trust.
        </DialogDescription>

        <Show
          when={!starting()}
          fallback={
            <div class="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle class="h-4 w-4 animate-spin text-primary" />
              Starting import…
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

        <Show when={!starting()}>
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
