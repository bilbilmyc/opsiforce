import { t } from '~/i18n';
import { createMemo, createSignal } from 'solid-js';
import { toast } from 'solid-sonner';
import { currentTenant, TENANT_HEADER } from '~/api/client';
import {
  buildUploadFormData,
  multipartBoundary,
  streamingMultipartBody,
  supportsRequestStreams,
} from './multipart-body';
import { parseUploadErrorMessage, parseUploadEvents, type UploadResult } from './upload-events';
import type { UploadFile } from './upload-file';

export interface CreateFileUploadOptions {
  url: () => string;
  onUploaded?: (files: UploadFile[], result: UploadResult) => void;
}

export interface FileUpload {
  uploading: () => boolean;
  percent: () => number;
  statusLabel: () => string;
  totalFiles: () => number;
  preparedFiles: () => number;
  sentBytes: () => number;
  totalBytes: () => number;
  upload: (files: UploadFile[]) => Promise<void>;
  cancel: () => void;
}

type StreamingRequestInit = RequestInit & { duplex: 'half' };

const CANCELLED = 'cancelled';
const PREPARE_YIELD_INTERVAL = 250;
const PROGRESS_THROTTLE_MS = 50;

export function createFileUpload(options: CreateFileUploadOptions): FileUpload {
  const [uploading, setUploading] = createSignal(false);
  const [totalFiles, setTotalFiles] = createSignal(0);
  const [preparedFiles, setPreparedFiles] = createSignal(0);
  const [totalBytes, setTotalBytes] = createSignal(0);
  const [sentBytes, setSentBytes] = createSignal(0);
  const [statusLabel, setStatusLabel] = createSignal('');

  let cancelHandle: (() => void) | undefined;
  let cancelRequested = false;

  const visibleBytes = createMemo(() => Math.min(totalBytes(), sentBytes()));
  const percent = createMemo(() => {
    if (uploading() && totalBytes() === 0 && totalFiles() > 0) {
      return Math.min(99, Math.floor((preparedFiles() / totalFiles()) * 100));
    }
    const total = totalBytes();
    if (total === 0) return 0;
    return Math.min(100, Math.floor((visibleBytes() / total) * 100));
  });

  function makeProgressReporter(totalData: number): (bytes: number) => void {
    let lastProgressAt = 0;
    return (bytes) => {
      const now = Date.now();
      if (now - lastProgressAt < PROGRESS_THROTTLE_MS && bytes < totalData) return;
      lastProgressAt = now;
      const sent = Math.min(totalData, bytes);
      setSentBytes(sent);
      setStatusLabel(sent >= totalData ? t("Finishing upload") : t("Sending files"));
    };
  }

  function sendStreaming(files: UploadFile[], totalData: number, url: string): Promise<UploadResult> {
    const boundary = multipartBoundary();
    const controller = new AbortController();
    cancelHandle = () => controller.abort();
    const body = streamingMultipartBody(files, boundary, controller.signal, makeProgressReporter(totalData));

    return fetch(url, {
      method: 'POST',
      headers: uploadHeaders({ 'Content-Type': `multipart/form-data; boundary=${boundary}` }),
      body,
      signal: controller.signal,
      duplex: 'half',
    } as StreamingRequestInit)
      .then(async (response) => {
        const text = await response.text();
        if (!response.ok) throw new Error(parseUploadErrorMessage(response.status, text));
        setSentBytes(totalData);
        setStatusLabel('Finishing upload');
        return parseUploadEvents(text);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') throw new Error(CANCELLED);
        throw err;
      });
  }

  function sendXhr(files: UploadFile[], totalData: number, url: string): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const reportProgress = makeProgressReporter(totalData);
      cancelHandle = () => xhr.abort();

      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        reportProgress(ev.loaded);
      };
      xhr.upload.onloadend = () => reportProgress(totalData);
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(parseUploadErrorMessage(xhr.status, xhr.responseText)));
          return;
        }
        try {
          resolve(parseUploadEvents(xhr.responseText));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      xhr.onabort = () => reject(new Error(CANCELLED));
      xhr.onerror = () => reject(new Error(t("Network error during upload")));
      xhr.ontimeout = () => reject(new Error(t("Upload timed out")));

      xhr.open('POST', url);
      for (const [header, value] of Object.entries(uploadHeaders())) {
        xhr.setRequestHeader(header, value);
      }
      xhr.send(buildUploadFormData(files));
    });
  }

  async function upload(files: UploadFile[]) {
    if (files.length === 0) return;
    if (uploading()) {
      toast.info(t("An upload is already in progress"));
      return;
    }

    const targetUrl = options.url();

    setTotalFiles(files.length);
    setPreparedFiles(0);
    setTotalBytes(0);
    setSentBytes(0);
    setStatusLabel('Preparing upload');
    setUploading(true);
    cancelRequested = false;

    await nextFrame();

    try {
      let totalData = 0;
      for (let i = 0; i < files.length; i++) {
        if (cancelRequested) throw new Error(CANCELLED);
        totalData += files[i].file.size;

        if (i === files.length - 1 || (i > 0 && i % PREPARE_YIELD_INTERVAL === 0)) {
          setPreparedFiles(i + 1);
          await nextFrame();
        }
      }
      setTotalBytes(totalData);
      setStatusLabel('Sending files');
      await nextFrame();

      const send = supportsRequestStreams ? sendStreaming : sendXhr;
      const result = await send(files, totalData, targetUrl);
      showUploadResult(result);
      options.onUploaded?.(files, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === CANCELLED) toast.info(t("Upload cancelled"));
      else toast.error(message);
    } finally {
      cancelHandle = undefined;
      setUploading(false);
    }
  }

  function cancel() {
    cancelRequested = true;
    cancelHandle?.();
    cancelHandle = undefined;
  }

  return {
    uploading,
    percent,
    statusLabel,
    totalFiles,
    preparedFiles,
    sentBytes: visibleBytes,
    totalBytes,
    upload,
    cancel,
  };
}

function uploadHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'x-upload-events': 'summary', ...extra };
  const tenant = currentTenant();
  if (tenant) headers[TENANT_HEADER] = tenant;
  return headers;
}

function showUploadResult(result: UploadResult) {
  if (result.failed === 0) {
    toast.success(t("{0} file{1} uploaded", { "0": result.uploaded, "1": result.uploaded !== 1 ? 's' : '' }));
  } else if (result.uploaded === 0) {
    toast.error(t("All {0} upload{1} failed", { "0": result.failed, "1": result.failed !== 1 ? 's' : '' }), {
      description: result.firstError ? `${result.firstError.path} - ${result.firstError.error}` : undefined,
    });
  } else {
    toast.warning(t("{0} uploaded, {1} failed", { "0": result.uploaded, "1": result.failed }), {
      description: result.firstError
        ? t("First error: {0} - {1}", { "0": result.firstError.path, "1": result.firstError.error })
        : undefined,
    });
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
