/** Support HTTPS clipboard access and the platform's HTTP development ingress. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Browser permissions may deny the modern API; try the focused document.
    }
  }
  const previous = document.activeElement as HTMLElement | null;
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('aria-label', 'Copy text');
  input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  // Keep focus inside an open popover/dialog so copying does not dismiss it.
  (previous?.parentElement ?? document.body).append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard copy was not available');
  } finally {
    input.remove();
    previous?.focus({ preventScroll: true });
  }
}
