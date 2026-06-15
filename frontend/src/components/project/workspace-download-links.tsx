import { onCleanup, onMount } from 'solid-js';

const WORKSPACE_PREFIX = '/workspace/';

export interface WorkspaceDownloadLinksProps {
  projectId: string;
  environmentId: string;
}

export default function WorkspaceDownloadLinks(props: WorkspaceDownloadLinksProps) {
  const handleClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    let pathname: string;
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      pathname = url.pathname;
    } catch {
      return;
    }

    if (!pathname.startsWith(WORKSPACE_PREFIX)) return;
    let relativePath: string;
    try {
      relativePath = decodeURIComponent(pathname.slice(WORKSPACE_PREFIX.length));
    } catch {
      return;
    }
    if (!relativePath) return;

    event.preventDefault();
    event.stopPropagation();
    triggerDownload(props.projectId, props.environmentId, relativePath);
  };

  onMount(() => document.addEventListener('click', handleClick, true));
  onCleanup(() => document.removeEventListener('click', handleClick, true));

  return null;
}

function triggerDownload(projectId: string, environmentId: string, relativePath: string) {
  const params = new URLSearchParams({ environmentId, path: relativePath });
  const tenant = localStorage.getItem('tenant');
  if (tenant) params.set('tenant', tenant);
  const link = document.createElement('a');
  link.href = `/api/projects/${projectId}/files/download?${params.toString()}`;
  link.download = relativePath.split('/').pop() || 'download';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
