import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableModels, providerGrants, runtimeModelConfig } from '../src/bifrost/bifrost.catalog';

test('catalog respects exact channel IDs, disabled keys, allowlists and explicit custom models', () => {
  const models = availableModels([
    { name: 'Zai', keys: [{ value: { value: 'redacted' }, models: ['glm-5.3-flash'] }] },
    { name: 'old', keys: [{ enabled: false, value: { value: 'redacted' } }] },
    { name: 'openai', keys: [{ value: { value: '' } }] },
    { name: 'relay', keys: [{ value: { value: 'redacted' }, models: ['*'], blacklisted_models: ['blocked'] }] },
  ], [{ provider: 'Zai', name: 'glm-5' }, { provider: 'old', name: 'old' }, { provider: 'relay', name: 'org/model' }, { provider: 'relay', name: 'blocked' }]);
  assert.deepEqual(models, [{ provider: 'relay', name: 'org/model' }, { provider: 'Zai', name: 'glm-5.3-flash' }]);
  assert.deepEqual(providerGrants(models).map(p => p.provider), ['relay', 'Zai']);
  const config = runtimeModelConfig(models, 'Zai/glm-5.3-flash');
  assert.equal(config.model, 'Zai/glm-5.3-flash');
  assert.equal((config.providers.relay as any).models['org/model'].modelID, 'relay/org/model');
  assert.equal(runtimeModelConfig(models, 'deleted/model').model, 'relay/org/model');
  assert.throws(() => runtimeModelConfig([], null), /Bifrost/);
});

test('pod initialization receives the same catalog as the running Agent', async () => {
  const { buildPodSpec } = await import('../src/pod/pod.template');
  const config = JSON.stringify(runtimeModelConfig([{ provider: 'Zai', name: 'glm-5' }], null));
  const pod = buildPodSpec({ podName: 'test', namespace: 'opsiforce', agentContainerImage: 'agent:test', agentPort: 4096,
    storageType: 'hostPath', storageMountPath: '/workspace', cephfsPvcName: '', imagePullPolicy: 'IfNotPresent',
    resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { memory: '1Gi' } }, bifrostProxyUrl: 'http://opsiforce-bifrost:8080/v1', bifrostApiKey: 'virtual-test', agentModelConfig: config });
  assert.equal(pod.spec?.initContainers?.[0].env?.find(e => e.name === 'OPSIFORCE_MODEL_CONFIG')?.value, config);
  assert.equal(pod.spec?.containers[0].env?.find(e => e.name === 'OPSIFORCE_MODEL_CONFIG')?.value, config);
});

test('model limits use catalog metadata and do not force every model into 32K/4K', () => {
  const config = runtimeModelConfig([
    { provider: 'Zai', name: 'glm-5.3-flash' },
    { provider: 'relay', name: 'large-model', context_length: 500000, max_output_tokens: 64000 } as any,
    { provider: 'relay', name: 'unknown-model' },
  ], 'Zai/glm-5.3-flash');
  assert.equal((config.providers.Zai as any).models['glm-5.3-flash'].limit.context, 0);
  assert.equal((config.providers.Zai as any).models['glm-5.3-flash'].generationPolicy.ready, false);
  assert.deepEqual((config.providers.relay as any).models['large-model'].limit, { context: 500000, output: 64000 });
  assert.deepEqual((config.providers.relay as any).models['unknown-model'].limit, { context: 0, output: 0 });
});

test('Agent config consumes Bifrost attributes and keeps local preferences separate', () => {
  const attributes = { 'opsiforce.context': '64000', 'opsiforce.maxOutput': '8192', 'opsiforce.tools': 'true', 'opsiforce.streaming': 'true', 'opsiforce.reasoningAccounting': 'shared', 'opsiforce.reasoningEfforts': '["low","high"]' };
  const config = runtimeModelConfig([{ provider: 'CaseSensitive', name: 'org/model', additional_attributes: attributes, policy: { outputBudget: 4096, reasoningEffort: 'high', context: 999 } }], null);
  const model = (config.providers.CaseSensitive as any).models['org/model'];
  assert.deepEqual(model.limit, { context: 64000, output: 8192 });
  assert.equal(model.generationPolicy.ready, true);
  assert.equal(model.generationPolicy.outputBudget, 4096);
  assert.deepEqual(model.variants.map((v: { id: string }) => v.id), ['low', 'high']);
});
