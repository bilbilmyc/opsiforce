import { type Accessor } from 'solid-js';
import { useQueryClient } from '@tanstack/solid-query';
import { createPersistedStringSignal } from './persisted-signal';

// Grandfathered key: unprefixed because existing tabs already have it.
// See persisted-signal.ts for the naming convention.
const TENANT_KEY = 'tenant';

export function createTenantState(): [Accessor<string>, (name: string) => void] {
  const queryClient = useQueryClient();
  const [tenant, setTenantSignal] = createPersistedStringSignal(TENANT_KEY, '');

  const setTenant = (name: string) => {
    if (name === tenant()) return;
    queryClient.cancelQueries();
    setTenantSignal(name);
    queryClient.resetQueries();
  };

  return [tenant, setTenant];
}
