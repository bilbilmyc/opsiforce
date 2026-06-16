import { createFileRoute } from '@tanstack/solid-router';
import { IntegrationsPage } from '~/pages/integrations';

export const Route = createFileRoute('/settings/integrations')({
  component: IntegrationsPage,
});
