type FileEvent =
  | { type: 'file'; path: string; size: number; ok: true }
  | { type: 'file'; path: string; size: 0; ok: false; error: string };
type DoneEvent = { type: 'done'; uploaded: number; failed: number };
type ErrorEvent = { type: 'error'; error: string; uploaded: number; failed: number };
type UploadEvent = FileEvent | DoneEvent | ErrorEvent;

export interface UploadResult {
  uploaded: number;
  failed: number;
  firstError?: { path: string; error: string };
}

export function parseUploadEvents(text: string): UploadResult {
  let doneEvent: DoneEvent | undefined;
  let errorEvent: ErrorEvent | undefined;
  let firstError: { path: string; error: string } | undefined;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: UploadEvent;
    try {
      event = JSON.parse(trimmed) as UploadEvent;
    } catch {
      continue;
    }

    if (event.type === 'file') {
      if (!event.ok && !firstError) {
        firstError = { path: event.path, error: event.error };
      }
    } else if (event.type === 'done') {
      doneEvent = event;
    } else if (event.type === 'error') {
      errorEvent = event;
    }
  }

  if (errorEvent) throw new Error(errorEvent.error);
  if (!doneEvent) throw new Error('Upload stream ended before completion');
  return { uploaded: doneEvent.uploaded, failed: doneEvent.failed, firstError };
}

export function parseUploadErrorMessage(status: number, text: string): string {
  const fallback = `Upload failed (${status})`;
  try {
    const body = JSON.parse(text) as { error?: string; message?: string };
    return body.error || body.message || fallback;
  } catch {
    return fallback;
  }
}
