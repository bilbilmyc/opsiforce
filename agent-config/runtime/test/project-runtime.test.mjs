import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, chmod, symlink, rm, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { listRecipes, resolveStartup, validateManifest } from '../project-runtime.mjs';
import schema from '../project.schema.json' with { type: 'json' };

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const config = (script = 'scripts/start app.sh', cwd = '.') => ({
  schemaVersion: 1, recipe: { id: 'custom-startup', version: '1' }, startup: { script, cwd },
});

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opsiforce-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'app'));
  const script = async (name = 'app/startup.sh', text = '#!/bin/sh\nexit 0\n') => {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), text, { mode: 0o755 });
  };
  const manifest = value => writeFile(path.join(root, 'app/opsiforce.project.json'), JSON.stringify(value));
  const run = (command, env = {}) => spawnSync(process.execPath, [cli, command], {
    env: { ...process.env, WORKSPACE: root, ...env }, encoding: 'utf8', timeout: 5000,
  });
  return { root, script, manifest, run };
}

test('legacy resolution is read-only and preserves the exact existing startup script', async t => {
  const f = await fixture(t);
  const original = '#!/bin/sh\n# Existing NestJS or FastAPI launch logic\nexit 0\n';
  await f.script('app/startup.sh', original);
  const plan = await resolveStartup(f.root);
  assert.equal(plan.source, 'legacy');
  assert.deepEqual(plan.recipe, { id: 'legacy-startup', version: '1', status: 'legacy' });
  assert.equal(plan.script, path.join(await realpath(f.root), 'app/startup.sh'));
  assert.equal(await readFile(path.join(f.root, 'app/startup.sh'), 'utf8'), original);
  assert.deepEqual(await readdir(path.join(f.root, 'app')), ['startup.sh']);
  assert.equal(f.run('inspect').status, 0);
});

test('custom script path with spaces resolves without forcing a framework or package manager', async t => {
  const f = await fixture(t);
  await f.script('scripts/start app.sh');
  await f.manifest(config('scripts/start app.sh', 'scripts'));
  const plan = await resolveStartup(f.root);
  assert.equal(plan.source, 'manifest');
  assert.equal(plan.recipe.status, 'experimental');
  assert.ok(plan.cwd.endsWith('/scripts'));
  assert.equal(f.run('run').status, 0);
});

test('strict schema rejects wrong versions, null, arrays, typos and future unsupported features', () => {
  for (const value of [null, [], {}, { ...config(), schemaVersion: 2 }, { ...config(), services: {} },
    { ...config(), recipe: { id: 'custom-startup', version: 1 } },
    { ...config(), startup: { script: 'app/startup.sh', cwd: '.', env: { PASSWORD: 'secret' } } }]) {
    assert.throws(() => validateManifest(value), error => error.code === 'INVALID_MANIFEST');
  }
});

test('unknown or planned recipes never silently fall back to the legacy template', async t => {
  const f = await fixture(t);
  await f.script();
  for (const id of ['unknown', ...listRecipes().recipes.filter(r => r.status === 'planned').map(r => r.id)]) {
    await f.manifest({ ...config('app/startup.sh'), recipe: { id, version: '1' } });
    await assert.rejects(resolveStartup(f.root), error => ['UNKNOWN_RECIPE', 'RECIPE_NOT_IMPLEMENTED'].includes(error.code));
  }
  await f.manifest({ ...config('app/startup.sh'), recipe: { id: 'custom-startup', version: '2' } });
  await assert.rejects(resolveStartup(f.root), error => error.code === 'UNKNOWN_RECIPE');
});

test('invalid JSON, JSON null, oversize files and dangling links do not trigger legacy fallback', async t => {
  const f = await fixture(t);
  await f.script('app/startup.sh', '#!/bin/sh\necho WRONG_FALLBACK\n');
  for (const content of ['{"secret":"DO_NOT_LOG",', 'null', ' '.repeat(65537)]) {
    await writeFile(path.join(f.root, 'app/opsiforce.project.json'), content);
    const result = f.run('run');
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes('DO_NOT_LOG'));
    assert.equal(JSON.parse(result.stderr).code, 'INVALID_MANIFEST');
  }
  await rm(path.join(f.root, 'app/opsiforce.project.json'));
  await symlink(path.join(f.root, 'missing'), path.join(f.root, 'app/opsiforce.project.json'));
  await assert.rejects(resolveStartup(f.root), error => error.code === 'PATH_UNAVAILABLE');
});

test('paths cannot traverse or escape through symlinks; internal symlinks remain usable', async t => {
  const f = await fixture(t);
  await f.script();
  for (const script of ['/bin/sh', '../start.sh', 'app/../app/startup.sh', 'C:\\start.cmd', 'app\\startup.sh']) {
    await f.manifest(config(script));
    await assert.rejects(resolveStartup(f.root), error => error.code === 'INVALID_PATH');
  }
  await symlink('/bin/sh', path.join(f.root, 'app/external.sh'));
  await f.manifest(config('app/external.sh'));
  await assert.rejects(resolveStartup(f.root), error => error.code === 'PATH_ESCAPE');
  await symlink('startup.sh', path.join(f.root, 'app/internal.sh'));
  await f.manifest(config('app/internal.sh'));
  assert.ok((await resolveStartup(f.root)).script.endsWith('/app/startup.sh'));
});

test('directories, missing scripts and non-executable files fail before starting', async t => {
  const f = await fixture(t);
  await f.manifest(config('app'));
  await assert.rejects(resolveStartup(f.root), error => error.code === 'INVALID_PATH');
  await f.manifest(config('app/startup.sh'));
  await assert.rejects(resolveStartup(f.root), error => error.code === 'PATH_UNAVAILABLE');
  await f.script();
  await chmod(path.join(f.root, 'app/startup.sh'), 0o644);
  await assert.rejects(resolveStartup(f.root), error => error.code === 'SCRIPT_NOT_EXECUTABLE');
});

test('legacy recipe cannot be relabelled to change its startup behavior', () => {
  assert.throws(() => validateManifest({ ...config(), recipe: { id: 'legacy-startup', version: '1' } }), /preserve/);
});

test('development/production environment, working directory, output and exit code are preserved', async t => {
  const f = await fixture(t);
  await f.script('scripts/start app.sh', '#!/bin/sh\nprintf "%s|%s|%s\\n" "$OPSIFORCE_ENV" "$APP_PORT" "$PWD"\nexit 17\n');
  await f.manifest(config('scripts/start app.sh', 'scripts'));
  for (const mode of ['development', 'production']) {
    const result = f.run('run', { OPSIFORCE_ENV: mode, APP_PORT: '3000' });
    assert.equal(result.status, 17);
    assert.ok(result.stdout.startsWith(`${mode}|3000|`));
    assert.ok(result.stdout.trimEnd().endsWith('/scripts'));
  }
});

test('exec replacement preserves PID and delivers termination to the application', { timeout: 8000 }, async t => {
  const f = await fixture(t);
  await f.script('app/startup.sh', `#!${process.execPath}\nprocess.on('SIGTERM',()=>process.exit(23)); setInterval(()=>{},1000); console.log(process.pid);\n`);
  const child = spawn(process.execPath, [cli, 'run'], { env: { ...process.env, WORKSPACE: f.root }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const exit = once(child, 'exit');
  const [bytes] = await once(child.stdout, 'data');
  assert.equal(Number(bytes.toString().trim()), child.pid);
  child.kill('SIGTERM');
  const [code, signal] = await exit;
  assert.equal(code, 23);
  assert.equal(signal, null);
});

test('registry identifies planned stacks honestly and is not mutable through the API', () => {
  const result = listRecipes();
  assert.equal(result.recipes.find(r => r.id === 'vue-go').status, 'planned');
  result.recipes.length = 0;
  assert.ok(listRecipes().recipes.length > 0);
});

test('schema changes cannot silently introduce validation keywords the runtime ignores', () => {
  const supported = new Set(['$schema', 'title', 'type', 'additionalProperties', 'required', 'properties', 'const', 'pattern', 'minLength', 'maxLength']);
  function check(rule) {
    for (const key of Object.keys(rule)) assert.ok(supported.has(key), `Unsupported schema keyword ${key}`);
    if (rule.type === 'object') {
      assert.equal(rule.additionalProperties, false);
      for (const child of Object.values(rule.properties)) check(child);
    }
  }
  check(schema);
});

test('a real HTTP application starts, stops and retains its data across launcher restarts', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  await f.script('app/server.cjs', `#!${process.execPath}
const http = require('node:http'), fs = require('node:fs');
const data = 'counter.txt';
const server = http.createServer((req, res) => {
  const count = Number(fs.existsSync(data) ? fs.readFileSync(data, 'utf8') : 0) + 1;
  fs.writeFileSync(data, String(count)); res.end(String(count));
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
`);
  await f.manifest(config('app/server.cjs', 'app'));
  for (const expected of [1, 2]) {
    const child = spawn(process.execPath, [cli, 'run'], { env: { ...process.env, WORKSPACE: f.root }, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
    const exit = once(child, 'exit');
    const [bytes] = await once(child.stdout, 'data');
    const response = await fetch(`http://127.0.0.1:${Number(bytes.toString().trim())}/`, { headers: { connection: 'close' } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), String(expected));
    child.kill('SIGTERM');
    assert.deepEqual(await exit, [0, null]);
  }
});

test('a non-regular manifest fails promptly rather than blocking boot', async t => {
  const f = await fixture(t);
  await f.script();
  await mkdir(path.join(f.root, 'app/opsiforce.project.json'));
  assert.equal(JSON.parse(f.run('inspect').stderr).code, 'INVALID_MANIFEST');
  await rm(path.join(f.root, 'app/opsiforce.project.json'), { recursive: true });
  const fifo = spawnSync('mkfifo', [path.join(f.root, 'app/opsiforce.project.json')]);
  assert.equal(fifo.status, 0);
  const result = f.run('inspect');
  assert.equal(result.error, undefined);
  assert.equal(JSON.parse(result.stderr).code, 'INVALID_MANIFEST');
});
