import { onMount } from 'solid-js';

declare global {
  interface Window {
    hj?: {
      (command: 'identify', userId: string, properties: Record<string, string>): void;
      (command: 'event', eventName: string): void;
      (command: 'stateChange', relativePath: string): void;
      q?: Array<[string, ...unknown[]]>;
    };
    _hjSettings?: { hjid: number; hjsv: number };
  }
}

export function HotjarScript() {
  onMount(() => {
    if (import.meta.env.MODE !== 'production') return;

    window.hj =
      window.hj ||
      function (...args: unknown[]) {
        (window.hj!.q = window.hj!.q || []).push(args as [string, ...unknown[]]);
      };
    window._hjSettings = { hjid: 4950106, hjsv: 6 };

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://b.simaanalytics.co/c/hotjar-${window._hjSettings.hjid}.js?sv=${window._hjSettings.hjsv}`;

    script.onload = async () => {
      try {
        const res = await fetch('/oauth2/userinfo');
        if (!res.ok) return;

        const userInfo = (await res.json()) as {
          preferredUsername: string;
          email: string;
          user: string;
        };

        window.hj?.('identify', userInfo.preferredUsername, {
          email: userInfo.email,
          id: userInfo.user,
        });
      } catch {}
    };

    document.head.appendChild(script);
  });

  return null;
}
