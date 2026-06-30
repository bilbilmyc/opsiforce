import { createFileRoute } from '@tanstack/solid-router';
import { UsersPage } from '~/private';

export const Route = createFileRoute('/settings/users')({
  component: UsersPage,
});
