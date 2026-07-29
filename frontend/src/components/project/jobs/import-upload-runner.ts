import { cancelImportUploadSession, ImportUploadError, runImportUpload, type StartImportResult } from '~/api/import';
import type { ImportUploadState, StartImportUploadInput } from './job-dock-context';

interface UploadRun {
  input: StartImportUploadInput;
  controller: AbortController;
  nextChunkIndex: number;
  driving: boolean;
}

export interface ImportUploadRunnerHooks {
  patchUpload: (key: string, patch: Partial<ImportUploadState>) => void;
  onEnqueued: (key: string, result: StartImportResult) => void;
}

export interface ImportUploadRunner {
  start: (key: string, input: StartImportUploadInput) => void;
  retry: (key: string) => void;
  cancel: (key: string) => void;
}

export function createImportUploadRunner(hooks: ImportUploadRunnerHooks): ImportUploadRunner {
  const runs = new Map<string, UploadRun>();

  const drive = async (key: string) => {
    const run = runs.get(key);
    if (!run) return;
    run.driving = true;
    const { input, controller } = run;
    try {
      const result = await runImportUpload({
        file: input.file,
        uploadId: input.uploadId,
        chunkSize: input.chunkSize,
        workspaceId: input.workspaceId,
        folderId: input.folderId,
        title: input.title,
        startIndex: run.nextChunkIndex,
        signal: controller.signal,
        onProgress: (bytesSent) => hooks.patchUpload(key, { bytesSent }),
        onChunkConfirmed: (nextChunkIndex) => {
          run.nextChunkIndex = nextChunkIndex;
        },
        onFinalizing: () => hooks.patchUpload(key, { phase: 'finalizing' }),
      });
      runs.delete(key);
      hooks.onEnqueued(key, result);
    } catch (err) {
      run.driving = false;
      if (controller.signal.aborted) return;
      const failure =
        err instanceof ImportUploadError
          ? err.toFailure()
          : {
              kind: 'upload' as const,
              message: err instanceof Error ? err.message : 'The import failed.',
              resumable: true,
            };
      hooks.patchUpload(key, { failure });
    }
  };

  return {
    start: (key, input) => {
      runs.set(key, { input, controller: new AbortController(), nextChunkIndex: 0, driving: false });
      void drive(key);
    },
    retry: (key) => {
      const run = runs.get(key);
      if (!run || run.driving) return;
      run.controller = new AbortController();
      hooks.patchUpload(key, { failure: null, phase: 'uploading' });
      void drive(key);
    },
    cancel: (key) => {
      const run = runs.get(key);
      if (!run) return;
      runs.delete(key);
      run.controller.abort();
      cancelImportUploadSession(run.input.uploadId);
    },
  };
}
