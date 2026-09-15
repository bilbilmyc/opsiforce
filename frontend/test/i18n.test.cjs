const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, relative);
  if (cache.has(file)) return cache.get(file);
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  cache.set(file, module.exports);
  new Function('require', 'module', 'exports', result.outputText)(
    name => load(path.relative(__dirname, path.resolve(path.dirname(file), name + '.ts'))), module, module.exports,
  );
  return module.exports;
}
const { translateMessage: t } = load('../src/i18n/translate.ts');
const { chinese, englishAliases } = load('../src/i18n/messages.ts');

test('English and existing Chinese UI copy both support two languages', () => {
  assert.equal(t('zh-CN', 'Defaults'), '默认设置');
  assert.equal(t('en', 'Defaults'), 'Defaults');
  assert.equal(t('en', '平台默认模型'), 'Platform default model');
  assert.equal(t('zh-CN', '平台默认模型'), '平台默认模型');
  assert.equal(t('zh-CN', '中'), '中');
});
test('interpolation never translates channel names, model IDs or user text', () => {
  assert.equal(t('zh-CN', '{0} · {1} models', { 0: 'Settings', 1: 0 }), 'Settings · 0 个模型');
  assert.equal(t('en', 'Matched {0} / {1} models', { 0: 1, 1: 51 }), 'Matched 1 / 51 models');
  assert.equal(t('zh-CN', 'Open {0}', { 0: 'vylai/organization/model-v1' }), '打开 vylai/organization/model-v1');
});
test('unknown text, deliberate whitespace and missing values are preserved', () => {
  assert.equal(t('en', '用户自己的说明'), '用户自己的说明');
  assert.equal(t('zh-CN', '  Settings '), '  设置 ');
  assert.equal(t('en', ' '), ' ');
  assert.equal(t('zh-CN', 'Open {0}'), '打开 {0}');
});
test('all translations are nonempty and do not invent interpolation parameters', () => {
  for (const [en, zh] of Object.entries(chinese)) {
    assert.ok(en.trim() && zh.trim(), en);
    const parameters = new Set(en.match(/\{\w+\}/g) ?? []);
    for (const parameter of zh.match(/\{\w+\}/g) ?? []) assert.ok(parameters.has(parameter), `${en}: ${parameter}`);
  }
  for (const en of Object.values(englishAliases)) assert.ok(chinese[en], en);
});
const { turnProgress } = load('../opencode/packages/app/src/session/timeline/turn-progress.ts');
test('chat status localization preserves terminal outcomes and upstream error text', () => {
  const response = { finish: 'stop', content: [{ type: 'text', text: 'Settings' }] };
  assert.equal(turnProgress(false, response, 'succeeded', 'en'), 'This turn is complete');
  assert.equal(turnProgress(false, response, 'succeeded', 'zh'), '本轮已完成');
  assert.equal(turnProgress(false, response, 'interrupted', 'en'), 'This turn was stopped.');
  assert.equal(turnProgress(false, { ...response, error: { type: 'upstream', message: '上游原文 Settings' } }, 'failed', 'en'), 'This turn did not complete: 上游原文 Settings');
  assert.match(turnProgress(true, { ...response, finish: 'length' }, undefined, 'en'), /Continuing/);
});
