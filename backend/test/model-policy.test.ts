import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveModelPolicy, validateModelPolicy, validateRuntimePolicy, preserveModelSelection } from '../src/bifrost/model-policy';

test('same model on different channels retains independent gateway limits and runtime budgets', () => {
  const a = resolveModelPolicy({ provider: 'A', name: 'org/model', context_length: 128000, max_output_tokens: 16000 }, { outputBudget: 12000 });
  const b = resolveModelPolicy({ provider: 'B', name: 'org/model', context_length: 32000, max_output_tokens: 4096 }, { outputBudget: 12000 });
  assert.equal(a.outputBudget, 12000);
  assert.equal(b.outputBudget, 4096);
  assert.equal(a.sources.context, 'gateway');
  assert.equal(resolveModelPolicy({ provider: 'A', name: 'm', context_length: 128000 }, { context: 64000, maxOutput: 8192 } as any).context, 128000);
});

test('unknown capability never falls back to a model-name guess', () => {
  const p = resolveModelPolicy({ provider: 'relay', name: 'glm-5.3' }, {});
  assert.equal(p.context, undefined);
  assert.equal(p.ready, false);
  assert.ok(p.missing.includes('context'));
  assert.ok(p.missing.includes('maxOutput'));
});

test('reject invalid, contradictory and unsupported reasoning settings', () => {
  for (const p of [{ context: -1 }, { maxOutput: 1.5 }, { context: 1000, maxInput: 2000 }, { reasoningEffort: 'high', reasoningEfforts: ['low'] }, { apiKey: 'no' }]) {
    assert.throws(() => validateModelPolicy(p));
  }
  assert.deepEqual(validateModelPolicy({ context: 32768, maxOutput: 8192, reasoningAccounting: 'shared' }).context, 32768);
});

test('refresh preserves explicit valid model and variant; removed selections are not silently rerouted', () => {
  assert.equal(preserveModelSelection('A/org/model#high', ['A/org/model'], 'B/default'), 'A/org/model#high');
  assert.equal(preserveModelSelection('removed/model', ['B/default'], 'B/default'), 'removed/model');
  assert.equal(preserveModelSelection(undefined, ['B/default'], 'B/default'), 'B/default');
});

const gateway = { provider: 'relay', name: 'org/model', context_length: 128000, additional_attributes: {
  'opsiforce.context': '64000', 'opsiforce.maxOutput': '8192', 'opsiforce.tools': 'true',
  'opsiforce.streaming': 'true', 'opsiforce.reasoningAccounting': 'shared', 'opsiforce.reasoningEfforts': '["low","high"]',
} };
test('Bifrost attributes are authoritative; local capability overrides are ignored', () => {
  const result = resolveModelPolicy(gateway, { context: 999, maxOutput: 999, tools: false, outputBudget: 4096, reasoningEffort: 'high' } as any);
  assert.equal(result.ready, true);
  assert.equal(result.context, 64000);
  assert.equal(result.maxOutput, 8192);
  assert.equal(result.tools, true);
  assert.equal(result.outputBudget, 4096);
  assert.equal(result.sources.context, 'gateway-attribute');
  assert.equal(result.sources.reasoningEffort, 'policy');
  const changed = resolveModelPolicy({ ...gateway, additional_attributes: { ...gateway.additional_attributes, 'opsiforce.maxOutput': '2048' } }, { outputBudget: 4096 });
  assert.equal(changed.outputBudget, 2048);
});
test('malformed Bifrost attributes fail closed without breaking other models', () => {
  for (const [key, value] of [['context', 'oops'], ['tools', '1'], ['reasoningEfforts', '"high"'], ['context', 'null'], ['streaming', '']]) {
    const result = resolveModelPolicy({ ...gateway, additional_attributes: { ...gateway.additional_attributes, [`opsiforce.${key}`]: value } });
    assert.equal(result.ready, false);
    assert.ok(result.errors.length);
    assert.doesNotThrow(() => JSON.stringify(result));
  }
});
test('runtime API rejects facts and validates reasoning against current Bifrost capabilities', () => {
  for (const p of [{ context: 1000 }, { tools: true }, { reasoningEfforts: ['low'] }, { outputBudget: 0 }, { reasoningEffort: 'default' }]) assert.throws(() => validateRuntimePolicy(p));
  assert.deepEqual(validateRuntimePolicy({ outputBudget: 4096, reasoningEffort: 'high' }), { outputBudget: 4096, reasoningEffort: 'high' });
  assert.equal(resolveModelPolicy(gateway, { reasoningEffort: 'max' }).ready, false);
  assert.equal(resolveModelPolicy({ ...gateway, additional_attributes: {} }, { outputBudget: 4096 }).ready, false);
});

test('disabling thinking clears request preferences without blocking the model', () => {
  const result = resolveModelPolicy({ ...gateway, additional_attributes: { ...gateway.additional_attributes, 'opsiforce.reasoningAccounting': 'none', 'opsiforce.reasoningEfforts': '[]', 'opsiforce.vision': 'true' } }, { reasoningEffort: 'high', reasoningBudget: 4096 });
  assert.equal(result.ready, true);
  assert.equal(result.reasoningEffort, undefined);
  assert.equal(result.reasoningBudget, undefined);
  assert.equal(result.vision, true);
});
