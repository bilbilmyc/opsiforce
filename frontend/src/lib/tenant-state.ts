import { createEffect, untrack, type Accessor } from 'solid-js';
import { useQueryClient } from '@tanstack/solid-query';
import { useLocation, useNavigate } from '@tanstack/solid-router';
import { createPersistedStringSignal } from './persisted-signal';

// Grandfathered key: unprefixed because existing tabs already have it.
// See persisted-signal.ts for the naming convention.
const TENANT_KEY = 'tenant';

export function createTenantState(): [Accessor<string>, (name: string) => void] {
  const [tenant, setTenantSignal] = createPersistedStringSignal(TENANT_KEY, '');

  const setTenant = (name: string) => {
    if (name === tenant()) return;
    setTenantSignal(name);
  };

  return [tenant, setTenant];
}

/**
 * Reacts to the tenant *value*, so a switch made in any tab is handled the same
 * way. See docs/adr/0023-tenant-switch-reacts-to-the-value.md.
 */
export function createTenantChangeHandler(): void {
  const [tenant] = createTenantState();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const leaveTenantScopedState = async () => {
    await queryClient.cancelQueries();
    if (untrack(() => location().pathname) !== '/') await navigate({ to: '/' });
    await queryClient.resetQueries();
  };

  let previousTenant = '';

  createEffect(() => {
    const currentTenant = tenant();
    const isSwitch = previousTenant !== '' && currentTenant !== previousTenant;
    previousTenant = currentTenant;
    if (isSwitch) void leaveTenantScopedState();
  });
}
