# Chat boot runs in its own Solid render root behind a connecting overlay

Status: accepted

## The problem

Opening a Project showed "Connecting…", then the entire project view — header, tabs, preview panel — went blank white for one to two seconds before the chat appeared. The blank arrived with the opencode 1.3.2 → 1.18.18 upgrade. On 1.3.2 the embed needed no loading handling at all: opencode's own `app.tsx` wrapped its router root in a `Suspense` with a loading fallback, so boot showed opencode's own loading UI inside the chat pane and nothing escaped. 1.18 removed that boundary entirely and gates its session content with fallback-less `<Show>`s, so boot suspension escapes to whatever ancestor boundary the host provides — in our embed that was TanStack Router's route boundary, which unmounted the whole `/projects/$projectId` match until opencode finished booting.

## Failed fixes, kept here so they are not retried

**A local `Suspense` around the embed.** Contains the blank but deadlocks opencode's cold boot: with no opencode persistence in localStorage (first visit, new browser, cleared site data), opencode's boot navigates its memory router and writes its persisted tab store inside `startTransition`, and under a foreign suspended `Suspense` boundary those transitions never commit. The composer renders but the `/global/event` sync stream never opens and messages never load until a reload. Warm boots resolve synchronously from persistence and never suspend, which made the failure look intermittent (verified: 0/2 cold boots with the boundary, 4/4 without).

**A readiness overlay awaiting `sync.session.lineage.resolve(sessionId)`.** Calling into opencode's sync store from outside races its own bootstrap — the same class of intermittent dead boots.

The rule both failures teach: nothing platform-side may await opencode's stores or place a `Suspense` above `AppInterface`.

## The fix

`ProjectChatTab` mounts the opencode subtree via `render()` into a host div — a separate Solid render root. Suspension cannot cross roots, so the project chrome can never be blanked, and opencode gets the same no-foreign-boundary environment it has in upstream's standalone app.

Two timing details are load-bearing:

- **The root is created one macrotask after mount** (`setTimeout(0)`). Solid transitions are global to the runtime, not per root; a root created while the platform's route transition is still pending gets its boot captured by that transition and deadlocks exactly like the local-`Suspense` variant did (observed on client-side navigation with cold persistence).
- **The embed's inputs are captured once per mount.** `server`, `serverKey`, `router`, and the title-sync callback are snapshotted when `ProjectChatTab` mounts; the embed root is not reactive to platform props. Environment switches already unmount the component (the connection hook resets its router to null), which disposes the root and re-arms everything for the new environment.

Inside the embed root:

- `OpenCodeEventBridge` (preview reload on session idle, title sync) sits above opencode's route-level server providers, so `useServerSDK()` is unavailable to it; it resolves the SDK the way that context does, via `useGlobal().ensureServerCtx(server)`, read untracked because the whole root is recreated rather than updated when the connection changes.
- `OpencodeOverrides` is passed through `AppInterface`'s `serverScoped` slot because it needs the Layout/Models providers, which upstream mounts server-scoped, below `AppInterface`'s children.
- Hooks needing platform context (`useSyncProjectTitle`) are called in `ProjectChatTab` itself and handed into the root as closures — the embed root has no access to the platform app's contexts.

## Covering the boot gap

With 1.18's own loading UI gone, the pane is bare from mount until the composer paints. The platform covers it with a "Connecting…" spinner overlaid on the pane, so the user sees one continuous spinner from the pre-router "Connecting…" state to the painted chat.

Dismissal is passive DOM observation, the only readiness signal the failed fixes leave open: a `MutationObserver` on the embed host fires until a composer element (`[contenteditable="true"]` or `textarea`) exists, then the overlay lifts after a double `requestAnimationFrame` so the frame that removes the spinner is one where the chat is already painted. A 15-second timeout bounds the coupling to opencode's DOM shape: if an upstream bump changes the composer markup, the spinner lifts late instead of stranding. Observer and timeout are cleaned up on unmount.

## Consequences

- The surrounding project chrome stays painted while the embed boots behind the platform's connecting overlay (verified by mid-boot screenshots on cold and warm profiles, full page loads and client-side navigations).
- Cold-profile reproduction for any future regression: `localStorage.clear()` on the opsiforce origin, then open a project — and test full page load and client-side navigation from home separately, as they have failed independently.
- No vendored edits: everything lives in opsiforce's embed layer, so the next opencode upgrade does not have to re-apply patches.
