import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
const { readCapabilities, defaultCapabilities, knownTemplate, blankCapabilities, modelCapabilityFormSchema, writeCapabilities } = await import(pathToFileURL(`${process.env.BIFROST_SOURCE}/ui/lib/modelCapabilities.ts`));

test('generic defaults are complete and do not require adding property names', () => {
  const d = readCapabilities({ provider: 'another-channel', name: 'custom-model' });
  assert.equal(modelCapabilityFormSchema.safeParse(d).success, true);
  assert.equal(d.context, '131072'); assert.equal(d.maxOutput, '65536');
  assert.equal(d.tools, 'true'); assert.equal(d.streaming, 'true'); assert.equal(d.vision, 'false');
});
test('known templates are selected by model without hardcoding the channel', () => {
  assert.equal(readCapabilities({ provider: 'Channel-B', name: 'glm-5.3' }).context, '1000000');
  assert.equal(knownTemplate('unrecognised'), undefined);
});
test('existing channel facts override templates, then native metadata, then defaults', () => {
  const d = readCapabilities({ provider: 'A', name: 'glm-5.3', context_length: 500000, additional_attributes: { 'opsiforce.context': '64000', 'opsiforce.maxOutput': '8192', 'opsiforce.vision': 'true' } });
  assert.equal(d.context, '64000'); assert.equal(d.vision, 'true');
});
test('rejects missing or contradictory values with Chinese errors', () => {
  for (const patch of [{ context: '' }, { maxOutput: '9999999' }, { maxInput: '-1' }, { tools: '' }, { reasoningEfforts: '["default"]' }, { vision: 'yes' }]) {
    const result = modelCapabilityFormSchema.safeParse({ ...blankCapabilities, ...patch });
    assert.equal(result.success, false); assert.match(result.error.issues[0].message, /[\u4e00-\u9fff]/);
  }
});
test('switch values serialize as booleans and preserve unrelated metadata', () => {
  const attrs = writeCapabilities({ description: '保留', 'custom.tag': '原标签', 'opsiforce.maxInput': '2000' }, { ...blankCapabilities, tools: 'false', vision: 'true' });
  assert.equal(attrs['opsiforce.tools'], 'false'); assert.equal(attrs['opsiforce.vision'], 'true');
  assert.equal(attrs['custom.tag'], '原标签'); assert.equal(attrs.description, '保留'); assert.equal(attrs['opsiforce.maxInput'], undefined);
});
test('copying a template does not mutate the source or copy credentials', () => {
  const source = { provider: 'A', name: 'glm-5.3', additional_attributes: { 'private.key': 'not-a-capability' } };
  const copy = { ...readCapabilities(source) }; copy.context = '500000';
  assert.equal(readCapabilities(source).context, '1000000'); assert.equal(copy['private.key'], undefined);
});

test('native metadata works for arbitrary channels and survives resetting defaults', () => {
  for (const provider of ['Kimi', 'MiniMax', 'DeepSeek', 'custom-channel']) {
    const model = { provider, name: 'custom-model', context_length: 262144, max_output_tokens: 16384, additional_attributes: { 'opsiforce.context': '131072' } };
    assert.equal(readCapabilities(model).context, '131072');
    assert.equal(defaultCapabilities(model).context, '262144');
    assert.equal(defaultCapabilities(model).maxOutput, '16384');
  }
});
test('partial metadata bounds inferred output without hiding contradictory explicit limits', () => {
  const model = { provider: 'custom', name: 'small-model', context_length: 8192 };
  assert.equal(defaultCapabilities(model).maxOutput, '8192');
  assert.equal(modelCapabilityFormSchema.safeParse(defaultCapabilities(model)).success, true);
  assert.equal(modelCapabilityFormSchema.safeParse(defaultCapabilities({ ...model, max_output_tokens: 65536 })).success, false);
});
