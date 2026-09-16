import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
