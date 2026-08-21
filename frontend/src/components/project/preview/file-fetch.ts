import { createEffect, createSignal, on, onCleanup, type Accessor } from 'solid-js';

export type FileFetchState<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'missing' }
  | { status: 'error' };

export interface FileMetadata {
  size: number | undefined;
}

export function createFileFetch<T>(
  url: Accessor<string>,
  read: (response: Response) => Promise<T>
): Accessor<FileFetchState<T>> {
  const [state, setState] = createSignal<FileFetchState<T>>({ status: 'loading' });

  createEffect(
    on(url, (current) => {
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      setState({ status: 'loading' });
      void request(current, controller.signal, read, setState);
    })
  );

  return state;
}

export function createFileProbe(url: Accessor<string>): Accessor<FileFetchState<FileMetadata>> {
  return createFileFetch(url, readMetadata);
}

async function request<T>(
  url: string,
  signal: AbortSignal,
  read: (response: Response) => Promise<T>,
  setState: (state: FileFetchState<T>) => void
): Promise<void> {
  try {
    const response = await fetch(url, { signal });
    if (response.status === 404) {
      setState({ status: 'missing' });
      return;
    }
    if (!response.ok) {
      setState({ status: 'error' });
      return;
    }
    setState({ status: 'ready', value: await read(response) });
  } catch {
    if (signal.aborted) return;
    setState({ status: 'error' });
  }
}

async function readMetadata(response: Response): Promise<FileMetadata> {
  await response.body?.cancel().catch(() => {});
  const header = response.headers.get('Content-Length');
  if (header === null) return { size: undefined };
  const size = Number(header);
  return { size: Number.isFinite(size) ? size : undefined };
}
