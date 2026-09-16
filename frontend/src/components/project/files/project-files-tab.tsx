import { t } from '~/i18n';
import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import { toast } from 'solid-sonner';
import ConfirmDialog from '~/components/ui/confirm-dialog';
import Spinner from '~/components/ui/spinner';
import { createPersistedSignal } from '~/lib/persisted-signal';
import { createFileUpload, readDroppedUploadFiles, transferHasFiles, type UploadFile } from '~/lib/upload';
import {
  deleteProjectFile,
  downloadFile,
  uploadUrl,
  useProjectFiles,
  type FileEntry,
  type FilesSectionKey,
} from '~/api/files';
import { defaultFileSection, FILES_SECTION_ORDER } from './file-section-state';
import { FILES_SECTION_LABELS, FilesSectionTabs } from './files-section-tabs';
import { FilesBreadcrumbs } from './files-breadcrumbs';
import { FilesDropOverlay } from './files-drop-overlay';
import { FilesDropzone } from './files-dropzone';
import { FilesViewToggle, type FilesViewMode } from './files-view-toggle';
import { FilesTable } from './files-table';
import { FilesCards } from './files-cards';

const EMPTY_COUNTS: Record<FilesSectionKey, number> = { generated: 0, uploads: 0, other: 0 };

function allowDrop(event: DragEvent) {
  if (!transferHasFiles(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

export interface ProjectFilesTabProps {
  projectId: string;
  environmentId: string;
  active: boolean;
  refreshToken: number;
  onPreviewFile: (path: string) => void;
  onFileDeleted: (path: string) => void;
}

export function ProjectFilesTab(props: ProjectFilesTabProps) {
  const [selectedSection, setSection] = createSignal<FilesSectionKey>();
  const [folderSegments, setFolderSegments] = createSignal<string[]>([]);
  const [view, setView] = createPersistedSignal<FilesViewMode>('opsiforce:files:view', 'table');
  const [dragDepth, setDragDepth] = createSignal(0);
  const [pendingDelete, setPendingDelete] = createSignal<FileEntry | null>(null);

  createEffect(
    on(
      () => props.environmentId,
      () => {
        setSection(undefined);
        setFolderSegments([]);
        setPendingDelete(null);
      },
      { defer: true }
    )
  );

  const root = useProjectFiles(
    () => props.projectId,
    () => props.environmentId,
    () => ''
  );

  const section = createMemo(() => selectedSection() ?? defaultFileSection(root.data));

  const sectionPath = (key: FilesSectionKey) =>
    root.data?.kind === 'root' ? (root.data.sections.find((s) => s.key === key)?.path ?? '') : '';

  const folderPath = createMemo(() => {
    const segments = folderSegments();
    if (segments.length === 0) return '';
    const base = sectionPath(section());
    const nested = segments.join('/');
    return base ? `${base}/${nested}` : nested;
  });

  const folder = useProjectFiles(
    () => props.projectId,
    () => props.environmentId,
    () => folderPath(),
    { enabled: () => folderPath() !== '' }
  );

  const refresh = () => {
    root.refetch();
    if (folderPath()) folder.refetch();
  };

  const uploadTargetPath = () =>
    section() === 'uploads' ? folderPath() || sectionPath('uploads') : sectionPath('uploads');

  const uploadTargetLabel = () => {
    const nested = section() === 'uploads' ? folderSegments().join('/') : '';
    return `${FILES_SECTION_LABELS.uploads}${nested ? `/${nested}` : ''}`;
  };

  const upload = createFileUpload({
    url: () => uploadUrl(props.projectId, props.environmentId, uploadTargetPath()),
    onUploaded: () => refresh(),
  });

  const counts = createMemo<Record<FilesSectionKey, number>>(() => {
    if (root.data?.kind !== 'root') return EMPTY_COUNTS;
    const next = { ...EMPTY_COUNTS };
    for (const s of root.data.sections) next[s.key] = s.entries.length;
    return next;
  });

  const entries = createMemo<FileEntry[]>(() => {
    if (folderSegments().length > 0) return folder.data?.kind === 'directory' ? folder.data.entries : [];
    if (root.data?.kind !== 'root') return [];
    return root.data.sections.find((s) => s.key === section())?.entries ?? [];
  });

  const loading = () => (folderSegments().length > 0 ? folder.isPending : root.isPending);
  const error = () => (folderSegments().length > 0 ? folder.error : root.error);

  createEffect(
    on(
      () => [props.refreshToken, props.active] as const,
      ([, active]) => {
        if (!active) return;
        refresh();
      },
      { defer: true }
    )
  );

  const pickSection = (key: FilesSectionKey) => {
    setSection(key);
    setFolderSegments([]);
  };

  const open = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      setSection(section());
      setFolderSegments((prev) => [...prev, entry.name]);
      return;
    }
    props.onPreviewFile(entry.path);
  };

  const download = (entry: FileEntry) => downloadFile(props.projectId, props.environmentId, entry);

  const remove = async (entry: FileEntry) => {
    try {
      await deleteProjectFile(props.projectId, props.environmentId, entry.path);
      props.onFileDeleted(entry.path);
      toast.success(t("{0} deleted", { "0": entry.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Could not delete {0}", { "0": entry.name }));
    } finally {
      refresh();
    }
  };

  const startDrop = (event: DragEvent) => {
    if (!transferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragDepth((depth) => depth + 1);
  };

  const endDrop = (event: DragEvent) => {
    if (!transferHasFiles(event.dataTransfer)) return;
    setDragDepth((depth) => Math.max(0, depth - 1));
  };

  const drop = (event: DragEvent) => {
    const transfer = event.dataTransfer;
    if (!transferHasFiles(transfer) || !transfer) return;
    event.preventDefault();
    setDragDepth(0);
    readDroppedUploadFiles(transfer).then((files: UploadFile[]) => upload.upload(files));
  };

  return (
    <div
      class="flex-1 min-h-0 flex flex-col relative"
      onDragEnter={startDrop}
      onDragOver={allowDrop}
      onDragLeave={endDrop}
      onDrop={drop}
    >
      <Show when={dragDepth() > 0}>
        <FilesDropOverlay label={t("Drop to upload into {0}", { "0": uploadTargetLabel() })} />
      </Show>

      <div class="flex items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
        <FilesSectionTabs active={section()} counts={counts()} onChange={pickSection} />
        <FilesViewToggle mode={view()} onChange={setView} />
      </div>

      <p class="px-4 pb-2 text-xs text-muted-foreground">{t('Browse app source in Project files, exported documents in Output files, and your uploads in User uploads.')}</p>
      <Show when={section() === 'other'}>
        <p class="px-4 pb-2 text-xs text-muted-foreground">{t('Project files are read-only here. Edit source in Code; private runtime files and dependencies are hidden.')}</p>
      </Show>

      <div class="px-4 pb-2 shrink-0">
        <FilesDropzone upload={upload} hint={t("Lands in {0}", { "0": uploadTargetLabel() })} dragging={dragDepth() > 0} />
      </div>

      <Show when={folderSegments().length > 0}>
        <div class="px-4 pb-2 shrink-0">
          <FilesBreadcrumbs
            rootLabel={FILES_SECTION_LABELS[section()]}
            segments={folderSegments()}
            onNavigate={(depth) => setFolderSegments((prev) => prev.slice(0, depth))}
          />
        </div>
      </Show>

      <div class="flex-1 min-h-0 overflow-auto px-4 pb-4">
        <Show when={!loading()} fallback={<Spinner label={t("Loading files...")} />}>
          <Show
            when={!error()}
            fallback={<div class="p-8 text-center text-xs text-destructive" role="alert">
              <p>{t('Could not read this directory. It may be unavailable or inaccessible.')}</p>
              <button type="button" class="mt-3 underline underline-offset-4" onClick={refresh}>{t('Retry')}</button>
            </div>}
          >
            <Show
              when={entries().length > 0}
              fallback={<div class="p-8 text-center text-xs text-muted-foreground">
                <p>{t("Nothing here yet.")}</p>
                <Show when={folderSegments().length === 0}>
                  <div class="mt-3 flex justify-center gap-3">
                    <For each={FILES_SECTION_ORDER.filter(key => key !== section() && counts()[key] > 0)}>{key =>
                      <button type="button" class="text-primary underline underline-offset-4" onClick={() => pickSection(key)}>{t('View {0}', { '0': FILES_SECTION_LABELS[key] })}</button>
                    }</For>
                  </div>
                </Show>
              </div>}
            >
              <Show
                when={view() === 'table'}
                fallback={
                  <FilesCards
                    entries={entries()}
                    onOpen={open}
                    onDownload={download}
                    onDelete={(entry) => setPendingDelete(entry)}
                  />
                }
              >
                <FilesTable
                  entries={entries()}
                  onOpen={open}
                  onDownload={download}
                  onDelete={(entry) => setPendingDelete(entry)}
                />
              </Show>
            </Show>
          </Show>
        </Show>
      </div>

      <Show when={pendingDelete()}>
        {(entry) => (
          <ConfirmDialog
            open
            onOpenChange={(isOpen) => {
              if (!isOpen) setPendingDelete(null);
            }}
            title={entry().type === 'directory' ? t("Delete folder \"{0}\"?", { "0": entry().name }) : t("Delete \"{0}\"?", { "0": entry().name })}
            description={
              entry().type === 'directory'
                ? t("The folder and everything inside it will be permanently deleted.")
                : t("This file will be permanently deleted.")
            }
            confirmLabel={t("Delete")}
            variant="destructive"
            onConfirm={() => void remove(entry())}
          />
        )}
      </Show>
    </div>
  );
}
