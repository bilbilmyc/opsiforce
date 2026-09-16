interface StatusEvents {
  message: MessageEvent<string>;
  error: Event;
}

export interface StatusSource {
  onmessage: ((event: MessageEvent<string>) => unknown) | null;
  addEventListener(type: 'message', listener: (event: MessageEvent<string>) => void): void;
  addEventListener(type: 'error', listener: (event: Event) => void): void;
  close(): void;
}

/** Same callbacks as the status EventSources, but finite requests for HTTP/1.
 * Chat keeps its real-time stream; status polling leaves browser slots for IO.
 */
class SnapshotSource extends EventTarget {
  onmessage: ((event: MessageEvent<string>) => unknown) | null = null;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request: AbortController | undefined;

  constructor(private readonly url: string) {
    super();
    // Match EventSource: consumers attach callbacks before any response arrives.
    queueMicrotask(() => void this.poll());
  }

  override addEventListener<K extends keyof StatusEvents>(type: K, listener: (event: StatusEvents[K]) => void): void;
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void;
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
    super.addEventListener(type, listener, options);
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.request?.abort();
  }

  private async poll() {
    if (this.closed) return;
    this.request = new AbortController();
    const timeout = setTimeout(() => this.request?.abort(), 10000);
    try {
      const response = await fetch(this.url, { signal: this.request.signal });
      if (this.closed) return;
      if (!response.ok) {
        const code = response.status === 403 ? 'forbidden' : response.status === 404 ? 'not_found' : 'internal';
        this.dispatchEvent(new MessageEvent('error', { data: JSON.stringify({ code, message: `HTTP ${response.status}` }) }));
        if ([401, 403, 404].includes(response.status)) this.close();
        return;
      }
      const value = await response.json();
      if (this.closed) return;
      for (const data of Array.isArray(value) ? value : value ? [value] : []) {
        if (this.closed) break;
        const event = new MessageEvent<string>('message', { data: JSON.stringify(data) });
        this.onmessage?.(event);
        this.dispatchEvent(event);
      }
    } catch {
      if (!this.closed) this.dispatchEvent(new Event('error'));
    } finally {
      clearTimeout(timeout);
      if (!this.closed) this.timer = setTimeout(() => void this.poll(), 3000);
    }
  }
}

export function createStatusSource(url: string): StatusSource {
  if (window.location.protocol !== 'http:') return new EventSource(url);
  const snapshot = new URL(url, window.location.href);
  if (snapshot.pathname.endsWith('/stream')) snapshot.pathname = snapshot.pathname.slice(0, -'/stream'.length);
  else snapshot.searchParams.set('snapshot', '1');
  return new SnapshotSource(snapshot.pathname + snapshot.search);
}
