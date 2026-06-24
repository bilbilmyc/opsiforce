import { For, Show, createSignal, onCleanup, type ParentProps } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { useNavigate } from '@tanstack/solid-router';
import { useQueryClient } from '@tanstack/solid-query';
import { JobDockContext, type JobDockApi, type ProjectViewHandlers, type TrackedJob } from './job-dock-context';
import { framePhase, jobOnTerminal, jobSseUrl, parseJobFrame, type JobHost } from './job-kind';
import { JobCard } from './job-card';
import { JobDialog } from './job-dialog';

export function JobDockHost(props: ParentProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tracked, setTracked] = createStore<Record<string, TrackedJob>>({});
  const [expandedKey, setExpandedKey] = createSignal<string | null>(null);
  const sources = new Map<string, EventSource>();
  const projectViews = new Map<string, ProjectViewHandlers>();

  const closeStream = (key: string) => {
    sources.get(key)?.close();
    sources.delete(key);
  };

  const dismiss = (key: string) => {
    closeStream(key);
    if (expandedKey() === key) setExpandedKey(null);
    setTracked(
      produce((draft) => {
        delete draft[key];
      })
    );
  };

  const host: JobHost = {
    qc,
    navigate: (projectId) =>
      navigate({ to: '/projects/$projectId', params: { projectId }, search: { prompt: undefined } }),
    dismiss,
    projectView: (projectId) => projectViews.get(projectId),
  };

  const openStream = (key: string) => {
    const entry = tracked[key];
    if (!entry || sources.has(key)) return;
    const source = new EventSource(jobSseUrl(entry));
    source.addEventListener('message', (event) => {
      try {
        const current = tracked[key];
        if (!current) return;
        const job = parseJobFrame(event.data);
        setTracked(key, 'job', job);
        const phase = framePhase(current.kind, job);
        if (phase === 'running') {
          setTracked(key, 'lastStep', job.status);
        } else {
          closeStream(key);
          jobOnTerminal(tracked[key], host);
        }
      } catch {
        // ignore malformed frames
      }
    });
    sources.set(key, source);
  };

  const track = (key: string, entry: TrackedJob) => {
    setTracked(key, entry);
    setExpandedKey(key);
    openStream(key);
  };

  const api: JobDockApi = {
    trackPublish: (input) => {
      const key = `publish:${input.environmentId}`;
      track(key, {
        kind: 'publish',
        key,
        id: input.environmentId,
        projectId: input.projectId,
        title: input.environmentName,
        environmentSlug: input.environmentSlug,
        job: null,
        lastStep: 'queued',
      });
    },
    trackDuplicate: (input) => {
      const key = `duplicate:${input.projectId}`;
      track(key, {
        kind: 'duplicate',
        key,
        id: input.projectId,
        projectId: input.projectId,
        title: input.title,
        job: null,
        lastStep: 'queued',
      });
    },
    trackExport: (input) => {
      const key = `export:${input.projectId}`;
      track(key, {
        kind: 'export',
        key,
        id: input.projectId,
        projectId: input.projectId,
        title: input.title,
        job: input.job,
        lastStep: input.job.status === 'failed' ? 'queued' : input.job.status,
      });
    },
    trackImport: (input) => {
      const key = `import:${input.projectId}`;
      track(key, {
        kind: 'import',
        key,
        id: input.projectId,
        projectId: input.projectId,
        title: input.title,
        job: input.job,
        lastStep: input.job.status === 'failed' ? 'queued' : input.job.status,
      });
    },
    entries: () => Object.values(tracked),
    registerProjectView: (projectId, handlers) => {
      projectViews.set(projectId, handlers);
      return () => {
        if (projectViews.get(projectId) === handlers) projectViews.delete(projectId);
      };
    },
  };

  onCleanup(() => {
    sources.forEach((source) => source.close());
    sources.clear();
  });

  const entries = () => Object.values(tracked);
  const expandedEntry = () => {
    const key = expandedKey();
    return key ? tracked[key] : undefined;
  };

  return (
    <JobDockContext.Provider value={api}>
      {props.children}

      <Show when={entries().length > 0}>
        <div class="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
          <For each={entries()}>
            {(entry) => (
              <Show when={expandedKey() !== entry.key}>
                <JobCard
                  entry={entry}
                  host={host}
                  onExpand={() => setExpandedKey(entry.key)}
                  onDismiss={() => dismiss(entry.key)}
                />
              </Show>
            )}
          </For>
        </div>
      </Show>

      <Show when={expandedEntry()}>
        {(entry) => (
          <JobDialog
            entry={entry()}
            host={host}
            onMinimize={() => setExpandedKey(null)}
            onDismiss={() => dismiss(entry().key)}
          />
        )}
      </Show>
    </JobDockContext.Provider>
  );
}
