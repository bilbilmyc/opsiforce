/** Background HTTP/1 tabs must release long-lived connections for foreground IO.
 * Each reconnect receives the server's latest status snapshot; server jobs keep running.
 */
export function whilePageVisible(connect: () => () => void, page = document, lifecycle = window): () => void {
  let close: (() => void) | undefined;
  let disposed = false;
  let active = true;
  const stop = () => {
    const current = close;
    close = undefined;
    current?.();
  };
  const update = () => {
    if (disposed || !active || page.visibilityState === 'hidden') stop();
    else if (!close) close = connect();
  };
  const hide = () => { active = false; stop(); };
  const show = () => { active = true; update(); };
  page.addEventListener('visibilitychange', update);
  lifecycle.addEventListener('pagehide', hide);
  lifecycle.addEventListener('pageshow', show);
  update();
  return () => {
    disposed = true;
    stop();
    page.removeEventListener('visibilitychange', update);
    lifecycle.removeEventListener('pagehide', hide);
    lifecycle.removeEventListener('pageshow', show);
  };
}
