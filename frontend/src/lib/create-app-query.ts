/**
 * createAppQuery — store-backed replacement for @tanstack/solid-query's `createQuery`.
 *
 * WHY THIS EXISTS
 * solid-query backs `query.data` with a Solid resource. Reading `data` subscribes the
 * read to the nearest <Suspense> boundary, and the adapter re-arms that resource on
 * every background refetch. TanStack Router's Solid port wraps every route match in its
 * own Suspense boundary, unconditionally (solid-router Match.tsx). So any refetch under a
 * route — a dialog switching its queries on, a window-focus refetch, an invalidation from
 * the project status SSE stream — re-suspends the boundary and makes Solid detach and
 * re-attach the entire route subtree. Re-attaching reloads our preview <iframe> (a fresh
 * document) and resets the embedded chat's scroll to the top. Those were the user-visible
 * symptoms: chat/preview "re-rendering" when opening Manage/Settings, and chat jumping to
 * the top after switching browser tabs.
 *
 * THE FIX
 * Build on @tanstack/query-core's QueryObserver (the engine the official adapters wrap)
 * and hold results in a Solid store instead of a resource. No resource means no Suspense
 * coupling: a refetch updates store fields in place and the route DOM is never detached.
 *
 * Results are reconciled into the store (solid-js/store `reconcile`) by default, keyed by
 * "id", so object fields and list item/array identities stay stable across refetches —
 * `<For>` rows keep their DOM nodes and local state instead of being recreated (an
 * unstable list identity is what made the sidebar rows remount and refetch in a loop).
 * Primitives and arrays of primitives (e.g. `string[]` permissions) can't be keyed, so
 * they're replaced wholesale. Pass `reconcile: "<field>"` to key a list by something other
 * than "id", or `reconcile: false` to opt out and replace the value on every settle.
 *
 * UPSTREAM — this is a known solid-query limitation, not our bug:
 *   - https://github.com/TanStack/query/issues/5010  refetch inside <Suspense> detaches DOM / resets focus
 *   - https://github.com/TanStack/query/issues/9883  refetchOnMount:false → unexpected suspense on mutation
 *   - https://github.com/TanStack/query/issues/9955  suspense triggered on data access after isSuccess
 *   - https://github.com/TanStack/query/pull/10053   partial upstream fix
 * Properly resolved in @tanstack/solid-query v6 (`data` reads plain state, no resource
 * coupling — exactly this approach), but v6 requires Solid 2.0
 * (peerDependencies: solid-js >=2.0.0-beta.0), which we can't adopt yet on Solid 1.9
 * alongside the vendored OpenCode UI + Kobalte.
 *
 * TODO: once the app is on Solid 2.0 + @tanstack/solid-query v6, delete this file and
 * revert the call sites to stock `createQuery` — behaviour is equivalent. See
 * docs/query-adapter.md for the full write-up.
 */
import { createComputed, createMemo, on, onCleanup } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import {
  QueryObserver,
  notifyManager,
  useQueryClient,
  type DefaultError,
  type QueryKey,
  type QueryObserverOptions,
  type QueryObserverResult,
} from '@tanstack/solid-query';

export interface AppQueryOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> extends QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey> {
  reconcile?: string | false;
}

const DEFAULT_RECONCILE_KEY = 'id';

function isReconcilable(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] !== 'object') return false;
  return true;
}

function mergeResult<TData, TError>(
  prev: QueryObserverResult<TData, TError>,
  next: QueryObserverResult<TData, TError>,
  reconcileKey: string | false
): QueryObserverResult<TData, TError> {
  if (reconcileKey === false || next.data === undefined || !isReconcilable(next.data)) return next;
  let data = next.data;
  if (prev.data === undefined) {
    try {
      data = structuredClone(next.data);
    } catch {
      data = next.data;
    }
  }
  const reconciled = reconcile(data, { key: reconcileKey })(prev.data);
  return { ...next, data: reconciled } as QueryObserverResult<TData, TError>;
}

export function createAppQuery<
  TQueryFnData,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: () => AppQueryOptions<TQueryFnData, TError, TData, TQueryKey>): QueryObserverResult<TData, TError> {
  const client = useQueryClient();
  const reconcileOption = options().reconcile;
  const reconcileKey = reconcileOption === false ? false : (reconcileOption ?? DEFAULT_RECONCILE_KEY);

  const defaultedOptions = createMemo(() => {
    const opts = client.defaultQueryOptions(options());
    opts._optimisticResults = 'optimistic';
    opts.structuralSharing = false;
    return opts;
  });

  const initialOptions = defaultedOptions();
  const observer = new QueryObserver(client, initialOptions);
  const [state, setState] = createStore(observer.getOptimisticResult(initialOptions));

  const applyResult = (result: QueryObserverResult<TData, TError>) => {
    setState((prev) => mergeResult(prev, result, reconcileKey));
  };

  const unsubscribe = observer.subscribe(notifyManager.batchCalls(applyResult));
  onCleanup(unsubscribe);

  createComputed(
    on(
      defaultedOptions,
      (opts) => {
        observer.setOptions(opts);
        applyResult(observer.getOptimisticResult(opts));
      },
      { defer: true }
    )
  );

  return state;
}
