import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProjectController } from '../src/project/project.controller';
import { AgentStatusStreamController } from '../src/project/agent-status-stream.controller';

test('HTTP status snapshots retain visibility checks and finish without opening streams', async () => {
  const reply = { send: (value: unknown) => value };
  const state = { id: 'project', status: 'active', app: null };
  const projectContext = {
    userService: { resolveUserId: async () => 'db-user' },
    projectService: { getState: async (input: unknown) => {
      assert.deepEqual(input, { projectId: 'project', tenantId: 'tenant', userId: 'db-user' });
      return state;
    } },
  };
  assert.deepEqual(await ProjectController.prototype.streamStatus.call(projectContext,
    'project', { tenantId: 'tenant', tenantName: 'test' }, { userId: 'user', username: 'user', email: null, displayName: null }, { query: { snapshot: '1' } } as any, reply as any), state);
  const statusContext = {
    userService: { getOrCreateUser: async () => ({ id: 'db-user' }) },
    projectService: { findVisibleProjectIds: async (input: unknown) => {
      assert.deepEqual(input, { tenantId: 'tenant', userId: 'db-user' }); return ['visible'];
    } },
    agentStatusService: { statusOf: (id: string) => { assert.equal(id, 'visible'); return 'working'; } },
  };
  assert.deepEqual(await AgentStatusStreamController.prototype.stream.call(statusContext,
    { tenantId: 'tenant', tenantName: 'test' }, { userId: 'user', username: 'user', email: null, displayName: null }, { query: { snapshot: '1' } } as any, reply as any),
    [{ projectId: 'visible', agentStatus: 'working' }]);
});
