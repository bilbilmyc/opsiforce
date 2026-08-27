import type { UploadFile } from './upload-file';

type StreamingRequestInit = RequestInit & { duplex: 'half' };

export const supportsRequestStreams: boolean = (() => {
  let duplexAccessed = false;
  let hasContentType = false;
  try {
    hasContentType = new Request('', {
      body: new ReadableStream(),
      method: 'POST',
      get duplex(): 'half' {
        duplexAccessed = true;
        return 'half';
      },
    } as StreamingRequestInit).headers.has('Content-Type');
  } catch {}
  return duplexAccessed && !hasContentType;
})();

export function multipartBoundary(): string {
  return `----opsiforce-upload-${crypto.randomUUID()}`;
}

export function buildUploadFormData(files: UploadFile[]): FormData {
  const form = new FormData();
  for (const { file, path } of files) {
    form.append(path, file, file.name);
  }
  return form;
}

export function streamingMultipartBody(
  files: UploadFile[],
  boundary: string,
  signal: AbortSignal,
  onFileBytes: (bytes: number) => void
): ReadableStream<Uint8Array> {
  const chunks = multipartChunks(files, boundary, signal, onFileBytes);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(next.value);
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

async function* multipartChunks(
  files: UploadFile[],
  boundary: string,
  signal: AbortSignal,
  onFileBytes: (bytes: number) => void
): AsyncGenerator<Uint8Array> {
  let sentFileBytes = 0;

  for (const { file, path } of files) {
    if (signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');

    yield multipartFileHeader(boundary, path, file);

    const reader = file.stream().getReader();
    try {
      while (true) {
        if (signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');
        const { done, value } = await reader.read();
        if (done) break;
        sentFileBytes += value.byteLength;
        onFileBytes(sentFileBytes);
        yield value;
      }
    } finally {
      reader.releaseLock();
    }

    yield multipartText('\r\n');
  }

  yield multipartText(`--${boundary}--\r\n`);
}

function multipartFileHeader(boundary: string, path: string, file: File): Uint8Array {
  const contentType = file.type || 'application/octet-stream';
  return multipartText(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${multipartHeaderValue(path)}"; filename="${multipartHeaderValue(file.name)}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
  );
}

function multipartHeaderValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, ' ');
}

function multipartText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
