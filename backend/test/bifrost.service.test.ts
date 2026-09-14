import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { BifrostService } from '../src/bifrost/bifrost.service';
import { db, pgClient } from '../db';

const models = [{ provider: 'Zai', name: 'glm-5' }];
function service() {
  const result = new BifrostService(new ConfigService({ bifrostProxyUrl: 'http://bifrost/v1', bifrostAdminUsername: 'test', bifrostAdminPassword: 'test' }), {} as any);
  result.getModels = async () => models;
  (result as any).modelConfig = async () => ({ model: 'Zai/glm-5', providers: {} });
  return result;
}

test('starting an existing failed environment repairs credentials before selecting keys', async () => {
  const original = db.select;
  const keys: any[] = [];
  const rows = [[{ projectId: 'project' }], [{ tenantId: 'tenant' }], keys];
  (db as any).select = () => ({ from: () => ({ where: async () => rows.shift() }) });
  try {
    const bifrost = service();
    let repaired = false;
    (bifrost as any).ensureResources = async (id: string, tenant: string) => {
      assert.equal(id, 'project'); assert.equal(tenant, 'tenant'); repaired = true;
      keys.push({ keyType: 'chat', bifrostKeyToken: 'virtual-chat' }, { keyType: 'backend', bifrostKeyToken: 'virtual-backend' });
    };
    const options = await bifrost.getEnvironmentPodOptions('failed-env');
    assert.equal(repaired, true);
    assert.equal(options?.bifrostApiKey, 'virtual-chat');
    assert.equal(options?.bifrostBackendApiKey, 'virtual-backend');
    assert.equal(JSON.parse(options!.agentModelConfig).model, 'Zai/glm-5');
  } finally { db.select = original; }
});

test('existing virtual key retains its token and receives current channel authorization', async () => {
  const original = db.select;
  (db as any).select = () => ({ from: () => ({ where: async () => [{ bifrostKeyId: 'key-id', bifrostKeyToken: 'existing-token' }] }) });
  try {
    const bifrost = service();
    const calls: any[] = [];
    (bifrost as any).request = async (...args: any[]) => { calls.push(args); return {}; };
    const key = await bifrost.createProjectKey('project', 'tenant', {} as any);
    assert.equal(key.keyToken, 'existing-token');
    assert.equal(calls[0][0], 'PUT');
    assert.deepEqual(calls[0][2].provider_configs.map((p: any) => p.provider), ['Zai']);
  } finally { db.select = original; await pgClient.end(); }
});

test('model discovery reads every catalog page, including GLM 5.3 Flash beyond the first five rows', async () => {
  const bifrost = new BifrostService(new ConfigService({ bifrostProxyUrl: 'http://bifrost/v1', bifrostAdminUsername: 'test', bifrostAdminPassword: 'test' }), {} as any);
  const names = ['glm-4.5', 'glm-4.5-air', 'glm-4.6', 'glm-4.7', 'glm-5', 'glm-5-turbo', 'glm-5.1', 'glm-5.2', 'glm-5.3', 'glm-5.3-flash'];
  const catalog = names.map(name => ({ provider: 'Zai', name }));
  const offsets: number[] = [];
  (bifrost as any).request = async (_method: string, requestPath: string) => {
    const url = new URL(requestPath, 'http://bifrost');
    if (url.pathname === '/api/providers') return { providers: [{ name: 'Zai' }] };
    if (url.pathname.endsWith('/keys')) return { keys: [{ enabled: true, value: { value: 'fixture' }, models: ['*'] }] };
    assert.equal(url.pathname, '/api/models/details');
    const offset = Number(url.searchParams.get('offset') ?? 0);
    offsets.push(offset);
    // Simulate a server that caps pages at five, even when a larger limit is requested.
    return { models: catalog.slice(offset, offset + 5), total: catalog.length };
  };
  const result = await bifrost.getModels(true);
  assert.equal(result.length, 10);
  assert.ok(result.some(m => m.provider === 'Zai' && m.name === 'glm-5.3-flash'));
  assert.deepEqual(offsets, [0, 5]);
});
