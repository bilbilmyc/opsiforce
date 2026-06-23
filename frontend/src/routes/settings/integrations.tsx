import { createFileRoute } from '@tanstack/solid-router';
import { IntegrationsPage } from '~/private';

export const Route = createFileRoute('/settings/integrations')({
  component: IntegrationsPage,
});
