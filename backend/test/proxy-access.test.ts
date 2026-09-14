import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { ProxyController } from '../src/proxy/proxy.controller';

test('private tool access checks user permissions and project visibility before starting a pod', async () => {
  const visits: string[] = [];
  const env = { id: 'env', tenantId: 'tenant', projectId: 'project' };
  const controller = new ProxyController(
    new ConfigService({ proxyControlToken: 'fixture', appsHostname: 'apps.test' }),
    { resolveVscodeUpstreamForProject: () => 'http://agent:8080', getAssignedPodName: () => 'agent' } as any,
    { findOneForUser: async (scope: any) => { assert.deepEqual(scope, { projectId: 'project', tenantId: 'tenant', userId: 'db-user' }); visits.push('access'); },
      ensureEnvironment: async () => { visits.push('start'); return { state: 'ready', env }; } } as any,
    { findByIdOrNull: async () => env } as any,
    { resolveAccessibleTenantNames: () => ['test'], getTenantById: async () => ({ name: 'test' }) } as any,
    {} as any,
    { resolveUserId: async () => 'db-user' } as any,
  );
  await assert.rejects(controller.ensureEnvironment('env', { surface: 'vscode' }, 'fixture', 'opsiforce-admins'), /No authenticated user/);
  await assert.rejects(controller.ensureEnvironment('env', { surface: 'db' }, 'fixture', '', 'user'), /Missing permission/);
  assert.deepEqual(visits, []);
  assert.equal((await controller.ensureEnvironment('env', { surface: 'vscode' }, 'fixture', 'role:opsiforce_can_view_code_tab', 'user')).state, 'ready');
  assert.deepEqual(visits, ['access', 'start']);
});
