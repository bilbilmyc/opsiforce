declare global {
  interface Window { __OPSIFORCE_CONFIG__?: { domain: string; scheme: 'http' | 'https' } }
}
export function publicDomain(surface: 'apps' | 'preview.apps' | 'code' | 'db') {
  const runtime = window.__OPSIFORCE_CONFIG__;
  if (runtime) return `${surface}.${runtime.domain}`;
  const defaults = { apps: import.meta.env.VITE_WEBAPP_DOMAIN, 'preview.apps': import.meta.env.VITE_WEBAPP_PREVIEW_DOMAIN,
    code: import.meta.env.VITE_VSCODE_DOMAIN, db: import.meta.env.VITE_DB_DOMAIN };
  return defaults[surface];
}
export function publicScheme() { return window.__OPSIFORCE_CONFIG__?.scheme || 'https'; }
