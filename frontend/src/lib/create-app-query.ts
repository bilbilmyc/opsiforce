/**
 * createAppQuery — store-backed replacement for @tanstack/solid-query's `createQuery`
 * that avoids the Suspense-driven route-DOM detaches (preview iframe reload, chat scroll
 * reset). The rationale, reconcile semantics, upstream issues, and the conditions for
 * removing it (Solid 2.0 + solid-query v6) are in
 * packages/opsiforce/docs/frontend/query-adapter.md.
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
