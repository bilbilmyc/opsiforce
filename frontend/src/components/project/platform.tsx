import type { Component } from 'solid-js';
import { MemoryRouter, createMemoryHistory, type BaseRouterProps } from '@solidjs/router';
import { type Platform, ServerConnection } from '@opencode-ai/app';
import { base64Encode } from '@opencode-ai/util/encode';

export function createProxyPlatform(proxyBaseUrl: string): Platform {
  const origin = window.location.origin;
  const prefix = proxyBaseUrl.startsWith(origin) ? proxyBaseUrl.slice(origin.length) : proxyBaseUrl;

  const rewriteUrl = (url: string): string => {
    if (!url.startsWith(`${origin}/`)) return url;
    const path = url.slice(origin.length);
    if (path.startsWith(`${prefix}/`)) return url;
    if (path.startsWith('/api/') || path === '/global/health') return `${origin}${prefix}${path}`;
    return url;
  };

  const proxiedFetch: typeof fetch = (input, init) => {
    if (typeof input === 'string') return fetch(rewriteUrl(input), init);
    if (input instanceof URL) return fetch(rewriteUrl(input.href), init);
    return fetch(new Request(rewriteUrl(input.url), input), init);
  };

  return {
    platform: 'web',
    openExternal: (url: string) => window.open(url, '_blank'),
    restart: async () => window.location.reload(),
    notify: async () => {},
    fetch: proxiedFetch,
  };
}

export function createSessionRouter(serverUrl: string, sessionId: string): Component<BaseRouterProps> {
  const serverKey = ServerConnection.Key.make(serverUrl);
  const initialPath = `/server/${base64Encode(serverKey)}/session/${sessionId}`;

  return (props) => {
    const history = createMemoryHistory();
    history.set({ value: initialPath });

    return (
      <MemoryRouter root={props.root} history={history}>
        {props.children}
      </MemoryRouter>
    );
  };
}
