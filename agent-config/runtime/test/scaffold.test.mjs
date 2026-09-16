import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../scaffold.mjs';
import { resolveStartup } from '../project-runtime.mjs';

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opsiforce scaffold '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

for (const id of ['fastapi', 'go']) {
  test(`${id} creates an executable manifest and excludes runtime data from publishing`, async t => {
    const root = await workspace(t);
    await scaffold(root, `${id}@1`);
    const plan = await resolveStartup(root);
    assert.equal(plan.recipe.id, id);
    assert.equal(plan.recipe.status, 'experimental');
    for (const script of ['startup.sh', 'run-backend.sh']) {
      assert.equal(spawnSync('bash', ['-n', path.join(root, 'app', script)]).status, 0);
    }
    const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(git('init', '-q').status, 0);
    for (const excluded of ['app/data/app.db', 'app/opsiforce.env.json', 'app/opsiforce.env.backup.json',
      'app/backend/.venv/bin/python', 'app/backend/.cache/modules/test', 'app/backend/.bin/server']) {
      assert.equal(git('check-ignore', excluded).status, 0, excluded);
    }
    for (const included of ['app/backend/main.py', 'app/backend/main.go', 'app/backend/go.sum', 'app/backend/requirements.lock', 'app/opsiforce.project.json']) {
      assert.equal(git('check-ignore', included).status, 1, included);
    }
  });
}

test('initialization refuses existing source, empty app and dangling symlinks', async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, 'app'));
  await assert.rejects(scaffold(root, 'fastapi@1'), { code: 'APP_EXISTS' });
  await writeFile(path.join(root, 'app/startup.sh'), 'keep this existing app');
  await assert.rejects(scaffold(root, 'go@1'), { code: 'APP_EXISTS' });
  assert.equal(await readFile(path.join(root, 'app/startup.sh'), 'utf8'), 'keep this existing app');
  await rm(path.join(root, 'app'), { recursive: true });
  await symlink(path.join(root, 'missing'), path.join(root, 'app'));
  await assert.rejects(scaffold(root, 'go@1'), { code: 'APP_EXISTS' });
});

test('only implemented, explicitly versioned templates can be created', async t => {
  const root = await workspace(t);
  for (const id of ['go', 'go@2', 'legacy-startup@1', 'react-fastapi@1', '../fastapi@1']) {
    await assert.rejects(scaffold(root, id), { code: 'TEMPLATE_UNAVAILABLE' });
  }
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'init', 'go@1'], { env: { ...process.env, WORKSPACE: root }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).recipe, 'go@1');
});

for (const recipe of ['fastapi', 'go', 'react-nest', 'custom-startup']) {
  test(`unified workspace initializes ${recipe} while preserving data and configuration`, async t => {
    const root = await workspace(t);
    await cp(fileURLToPath(new URL('../bootstrap/', import.meta.url)), path.join(root, 'app'), { recursive: true });
    await mkdir(path.join(root, 'app/data'));
    await writeFile(path.join(root, 'app/data/app.db'), 'platform-created data');
    await writeFile(path.join(root, 'app/opsiforce.env.json'), '{"KEY":"existing"}');
    await scaffold(root, `${recipe}@1`);
    assert.equal((await resolveStartup(root)).recipe.id, recipe);
    assert.equal(await readFile(path.join(root, 'app/data/app.db'), 'utf8'), 'platform-created data');
    assert.equal(await readFile(path.join(root, 'app/opsiforce.env.json'), 'utf8'), '{"KEY":"existing"}');
    assert.ok(!(await readdir(path.join(root, 'app'))).includes('.opsiforce-bootstrap'));
    await assert.rejects(scaffold(root, 'go@1'), { code: 'APP_EXISTS' });
  });
}

test('bootstrap initialization refuses edited files and symlinked data without changing them', async t => {
  for (const kind of ['extra', 'edited-ignore', 'symlink-data', 'symlink-app']) {
    const root = await workspace(t);
    const app = path.join(root, 'app');
    await cp(fileURLToPath(new URL('../bootstrap/', import.meta.url)), app, { recursive: true });
    if (kind === 'extra') await writeFile(path.join(app, 'main.py'), 'user source');
    if (kind === 'edited-ignore') await writeFile(path.join(app, '.gitignore'), 'user ignores');
    if (kind === 'symlink-data') await symlink(root, path.join(app, 'data'));
    if (kind === 'symlink-app') {
      const { rename } = await import('node:fs/promises');
      await rename(app, path.join(root, 'original'));
      await symlink(path.join(root, 'original'), app);
    }
    const before = await readdir(app);
    await assert.rejects(scaffold(root, 'fastapi@1'), { code: 'APP_EXISTS' });
    assert.deepEqual(await readdir(app), before);
  }
});

test('runtime waits quietly for initialization then starts the selected launcher', async t => {
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const root = await workspace(t);
  await cp(fileURLToPath(new URL('../bootstrap/', import.meta.url)), path.join(root, 'app'), { recursive: true });
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const env = { ...process.env, WORKSPACE: root, PATH: `${root}:${process.env.PATH}` };
  const inspect = spawnSync(process.execPath, [cli, 'inspect'], { env, encoding: 'utf8' });
  assert.equal(JSON.parse(inspect.stdout).source, 'bootstrap');
  // Substitute only the supervisor; exercise the actual dispatcher and startup script.
  await writeFile(path.join(root, 'guard'), '#!/bin/sh\necho selected-app-started\n', { mode: 0o755 });
  const child = spawn(process.execPath, [cli, 'run'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  let stdout = ''; let stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  await once(child.stdout, 'data');
  assert.match(stdout, /Waiting for App Builder/);
  const exited = once(child, 'exit');
  await scaffold(root, 'custom-startup@1');
  await writeFile(path.join(root, 'app/run-app.sh'), '#!/bin/sh\nexit 0\n');
  const [code] = await exited;
  assert.equal(code, 0, stderr);
  assert.match(stdout, /selected-app-started/);
});
