import { createFileRoute } from '@tanstack/solid-router';
import { privateRouteComponent } from '~/private-loader';

export const Route = createFileRoute('/settings/users')({
  component: privateRouteComponent('/settings/users'),
});
