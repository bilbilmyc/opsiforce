import { createSignal, onMount, onCleanup, type Accessor } from 'solid-js';

export interface ResizablePanelOptions {
  storageKey: string;
  minWidth: number;
  defaultWidth: number | (() => number);
  maxWidth: () => number;
  direction: 'left' | 'right';
}

export interface ResizablePanel {
  width: Accessor<number>;
  resizing: Accessor<boolean>;
  startResize: (event: PointerEvent) => void;
}

export function createResizablePanel(options: ResizablePanelOptions): ResizablePanel {
  const resolveDefault = () =>
    typeof options.defaultWidth === 'function' ? options.defaultWidth() : options.defaultWidth;

  function clamp(width: number) {
    const max = Math.max(options.minWidth, options.maxWidth());
    return Math.min(Math.max(width, options.minWidth), max);
  }

  function readInitial(): number {
    if (typeof window === 'undefined') return resolveDefault();
    const stored = window.localStorage.getItem(options.storageKey);
    const parsed = stored ? Number(stored) : NaN;
    return clamp(Number.isFinite(parsed) ? parsed : resolveDefault());
  }

  const [width, setWidth] = createSignal(readInitial());
  const [resizing, setResizing] = createSignal(false);

  function startResize(event: PointerEvent) {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    const pointerId = event.pointerId;
    target?.setPointerCapture?.(pointerId);
    setResizing(true);
    const startX = event.clientX;
    const startWidth = width();

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const delta = options.direction === 'left' ? startX - e.clientX : e.clientX - startX;
      setWidth(clamp(startWidth + delta));
    };
    const finish = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.localStorage.setItem(options.storageKey, String(width()));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  const onWindowResize = () => setWidth((w) => clamp(w));
  onMount(() => window.addEventListener('resize', onWindowResize));
  onCleanup(() => window.removeEventListener('resize', onWindowResize));

  return { width, resizing, startResize };
}
