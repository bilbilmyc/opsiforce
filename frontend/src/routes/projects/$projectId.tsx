import { createFileRoute } from '@tanstack/solid-router';
import { ProjectView } from '~/pages/project';

export const Route = createFileRoute('/projects/$projectId')({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : undefined,
  }),
  component: ProjectPage,
});

function ProjectPage() {
  const params = Route.useParams();
  const search = Route.useSearch();
  return <ProjectView projectId={params().projectId} initialPrompt={search().prompt} />;
}
