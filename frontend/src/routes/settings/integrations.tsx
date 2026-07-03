import { createFileRoute } from '@tanstack/solid-router';
import { privateRouteComponent } from '~/private-loader';

export const Route = createFileRoute('/settings/integrations')({
  component: privateRouteComponent('/settings/integrations'),
});
