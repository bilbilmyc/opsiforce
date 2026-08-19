# Chat boot suspense is contained locally and covered until the session syncs

Status: accepted

Opening a Project showed "Connecting…", then the entire project view — header, tabs, preview panel — went blank white for one to two seconds before the chat appeared. The blank arrived with the opencode 1.18.18 upgrade: `AppInterface`'s providers read async resources while mounting (i18n bundles, lazy route chunks), and Solid suspension propagates to the nearest ancestor `Suspense` boundary. The embed had none of its own, so it bubbled into TanStack Router's internal per-route boundary and unmounted the whole `/projects/$projectId` match until opencode finished booting. A second, distinct gap follows: opencode's session route gates on the session lineage resolving in its sync store (`<Show when={directory()}>` with no fallback), so after the shell paints, the pane stays empty while session data streams from the agent pod.

`ProjectChatTab` now wraps the opencode subtree in its own `Suspense` boundary, so suspension stops at the chat pane and the rest of the route stays painted. On top of that, an `OpenCodeReadinessGate` keeps the "Connecting…" spinner as an overlay until `sync.session.lineage.resolve(sessionId)` settles — the same resolution the session route itself waits on — using the session id the connection hook already resolves before creating the router. The result is one continuous spinner from click to painted chat.

## Why containment plus a data-driven overlay

- **A local `Suspense`, not a route `pendingComponent`.** The router's boundary is the wrong altitude: it can only blank or fallback the whole view, and the header/preview panel have no reason to disappear while an embedded widget boots. Containment keeps the failure domain the size of the widget.
- **The overlay waits on the sync store, not the DOM.** Earlier attempts detected readiness by observing opencode's DOM (composer selectors, `main` children). Those break silently on upstream bumps — 1.18.18's composer is a contenteditable, not a `textarea`. Awaiting the same `lineage.resolve` promise the session route gates on tracks the real condition, and it settles on failure too, so opencode's own not-found/error views surface instead of a stuck spinner.
- **No vendored edits.** Everything lives in opsiforce's embed layer, so the next opencode upgrade does not have to re-apply patches.

## Consequences

- `useOpenCodeConnection` exposes the resolved `sessionId` alongside the router; `ProjectChatTab` takes it as a prop. Projects without a session (fresh, prompt-first) skip the overlay immediately.
- The gate is coupled to opencode's `ensureServerCtx(...).sync.session.lineage.resolve` shape; an upstream rename breaks the overlay loudly at typecheck, not silently at runtime.
- Environment switches reset the connection (router goes null), which unmounts the chat tab and re-arms the overlay for the new environment's boot.
- The contained boundary means opencode's own suspensions after boot (e.g. lazy-loading a settings dialog) can only ever blank the chat pane, never the surrounding project chrome.
