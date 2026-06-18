# Query Adapter

> Why every read query goes through the in-house `createAppQuery` wrapper instead of stock `createQuery`, and when it can be removed. Read this before adding a data query or debugging "panels re-rendering".

The frontend talks to the backend through [TanStack Query](https://tanstack.com/query) (`@tanstack/solid-query`). All read queries go through a small in-house wrapper, **`createAppQuery`** (`frontend/src/lib/create-app-query.ts`), instead of the library's stock `createQuery`. This page explains why that wrapper exists and what it changes.

## The problem it solves

TanStack's Solid adapter backs every query's `data` field with a Solid **resource**. Reading `data` while a query has no value yet wires that read into the nearest Solid `<Suspense>` boundary, and the adapter re-arms the resource on essentially every background refetch. TanStack Router (the Solid port) wraps **every route match in its own Suspense boundary**, unconditionally.

The two combine into a sharp edge: any refetch under a route — opening a dialog whose queries switch on, a window-focus refetch, an invalidation triggered by our project status stream — briefly re-suspends the route's boundary. Solid responds by **detaching and re-attaching the entire route subtree's DOM**. For most UI that's invisible, but our project page hosts two stateful things that don't survive a detach: the **preview `<iframe>`** (re-attaching forces a full document reload) and the **embedded chat** (re-attaching resets its scroll position to the top). The visible symptoms were panels "re-rendering" when opening Manage/Settings and the chat jumping to the top after switching browser tabs.

This is a known upstream limitation (TanStack Query issues [#5010](https://github.com/TanStack/query/issues/5010), [#9883](https://github.com/TanStack/query/issues/9883), [#9955](https://github.com/TanStack/query/issues/9955), with a partial fix in [PR #10053](https://github.com/TanStack/query/pull/10053)). It is fully resolved in `@tanstack/solid-query` v6 (`data` reads plain state, no resource coupling — exactly this approach) — but v6 requires Solid 2.0 (`solid-js >=2.0.0-beta.0`), which the app (and the vendored OpenCode UI + Kobalte) can't adopt yet.

## What the adapter does

`createAppQuery` keeps TanStack Query's caching, deduplication, invalidation, and refetch logic — it builds directly on `@tanstack/query-core`'s `QueryObserver`, the same engine the official adapters use — but it stores results in a plain Solid **store** instead of a resource. Because there's no resource, reading `data` never subscribes to a Suspense boundary, so a refetch updates the store fields in place and the route DOM is never detached.

Crucially, it **reconciles results into the store by default** (via `solid-js/store`'s `reconcile`, keyed by `"id"`). Reconciling keeps object fields and list-item identities stable across refetches, so a `<For>` keeps its existing DOM rows and their local state (focus, drag handles, per-row queries) instead of recreating them — unstable list identity is exactly what made the sidebar rows remount and refetch in a loop. This is automatic for every query; individual call sites no longer pass a `reconcile` option:

- Objects and arrays of objects are reconciled (default key `"id"`).
- Primitives and arrays of primitives (e.g. the `string[]` from the permissions query) can't be keyed, so they're replaced wholesale.
- Override per query when needed: `reconcile: "<field>"` to key a list by a non-`id` field, or `reconcile: false` to disable reconciliation and replace the value on every settle.

Errors surface through `.error` / `.isError` on the returned object (the app already reads them this way) rather than being thrown into the router's error boundary.

## Scope and conventions

- **Use `createAppQuery` for all read queries.** Import it from `~/lib/create-app-query`. The call signature matches the stock `createQuery` (an options thunk), plus the optional `reconcile` field.
- **Mutations stay stock.** `createMutation`, `useQueryClient`, `QueryClientProvider`, and the devtools are imported from `@tanstack/solid-query` unchanged — only the read path needed replacing.
- **Global query defaults** live in `frontend/src/routes/__root.tsx`: `staleTime: 0` (always revalidate) and `refetchOnWindowFocus: true` (refresh on tab return) — both safe now that refetches don't disturb the DOM.

## When to remove it

This wrapper is a back-port of the v6 behaviour. Once the app can move to Solid 2.0 + `@tanstack/solid-query` v6, `createAppQuery` can be deleted and the call sites reverted to stock `createQuery` with no behavioural change.

## See also

- [Overview](../overview.md) — the source-level OpenCode integration that pins the app (and the vendored UI) to Solid 1.x.
- Code: `frontend/src/lib/create-app-query.ts` (the wrapper); global query defaults in `frontend/src/routes/__root.tsx` (`staleTime: 0`, `refetchOnWindowFocus: true`).
