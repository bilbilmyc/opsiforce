import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { composeRuntimeAgents } from '../../scripts/compose-runtime-agents.mjs';
import { composeSkills } from '../../scripts/compose-skills.mjs';

const source = fileURLToPath(new URL('../../', import.meta.url));

test('recipe profiles compose exact templates and isolated instructions, then sync and retain existing source', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opsiforce-agents-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agents = path.join(root, 'agents');
  await mkdir(agents);
  const registry = JSON.parse(await readFile(path.join(source, 'agents.json'), 'utf8'));
  await writeFile(path.join(agents, 'agents.json'), JSON.stringify(registry));
  assert.deepEqual(await composeRuntimeAgents(agents), [
    { name: 'app-builder-python', recipe: 'fastapi@1' }, { name: 'app-builder-go', recipe: 'go@1' },
  ]);
  for (const name of ['app-builder-python', 'app-builder-go']) {
    const profile = registry.agents[name];
    const agentRoot = path.join(agents, name);
    const workspace = path.join(agentRoot, 'template');
    const manifest = JSON.parse(await readFile(path.join(workspace, 'app/opsiforce.project.json'), 'utf8'));
    assert.equal(`${manifest.recipe.id}@${manifest.recipe.version}`, profile.recipe);
    const prompt = await readFile(path.join(agentRoot, 'agent.md'), 'utf8');
    assert.ok(prompt.includes(profile.recipe));
    assert.ok(prompt.includes('opsiforce-runtime restart'));
    assert.ok(!prompt.includes('yarn install'));
    const skills = path.join(agentRoot, 'skills');
    await composeSkills({ sharedDir: path.join(source, 'skills'), overridesDir: path.join(root, 'empty'), outDir: skills, sharedSkills: profile.sharedSkills });
    assert.deepEqual((await readdir(skills)).sort(), [...profile.sharedSkills].sort());
    assert.ok(!profile.sharedSkills.includes('nestjs-api'));
    const env = { ...process.env, AGENTS_ROOT: agents, AGENT_NAME: name, WORKSPACE: workspace, OPENCODE_ROOT: source };
    const sync = () => spawnSync(process.execPath, [path.join(source, 'scripts/agent-workspace-migrate.mjs'), '--sync-agent-files'], { env, encoding: 'utf8' });
    await writeFile(path.join(workspace, 'app/user-file'), 'preserve user edits');
    let result = sync();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(path.join(workspace, '.opencode/agents', `${name}.md`), 'utf8'), prompt);
    assert.equal(JSON.parse(await readFile(path.join(workspace, '.opencode/opencode.json'), 'utf8')).default_agent, name);
    assert.equal(await readFile(path.join(workspace, 'app/user-file'), 'utf8'), 'preserve user edits');
    await writeFile(path.join(workspace, 'app/opsiforce.project.json'), JSON.stringify({ ...manifest, recipe: { id: 'wrong', version: '1' } }));
    result = sync();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /does not match/);
    assert.equal(await readFile(path.join(workspace, 'app/user-file'), 'utf8'), 'preserve user edits');
  }
});

test('invalid skill allowlists fail instead of silently exposing the full legacy skill set', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opsiforce-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const sharedSkills of ['all', ['nonexistent']]) {
    await assert.rejects(composeSkills({ sharedDir: path.join(source, 'skills'), overridesDir: root,
      outDir: path.join(root, 'out'), sharedSkills }), /existing shared skills/);
  }
});
