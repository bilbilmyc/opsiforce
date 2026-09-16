import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { isAgentEnabled, readMergedAgentRegistry } from '../src/agent/agent-config';
import { AgentService } from '../src/agent/agent.service';
import { ProjectService } from '../src/project/project.service';
import { ProjectImportService } from '../src/project/project-import.service';
import { db } from '../db';

test('retired language profiles remain hidden even with the old deployment opt-in', () => {
  const registry = readMergedAgentRegistry({ agents: {} });
  assert.equal(isAgentEnabled(registry.agents['app-builder'], ''), true);
  assert.equal(isAgentEnabled(undefined, ''), true);
  for (const name of ['app-builder-python', 'app-builder-go']) {
    const entry = registry.agents[name];
    assert.ok(entry.recipe);
    assert.equal(isAgentEnabled(entry, ''), false);
    assert.equal(isAgentEnabled(entry, '*'), false);
    assert.equal(isAgentEnabled(entry, 'fastapi@2,go@2'), false);
    assert.equal(isAgentEnabled(entry, ' fastapi@1, go@1 '), false);
    assert.equal(isAgentEnabled({ recipe: entry.recipe }, entry.recipe), true);
    assert.equal(entry.poolSize, 0);
  }
});

test('disabled recipe creation is rejected before any pool claim, settings lookup or project writes', async t => {
  const previous = process.env.ENABLED_PROJECT_RECIPES;
  process.env.ENABLED_PROJECT_RECIPES = '';
  t.after(() => { if (previous === undefined) delete process.env.ENABLED_PROJECT_RECIPES; else process.env.ENABLED_PROJECT_RECIPES = previous; });
  const service = new AgentService();
  service.findById = async id => ({ id, name: 'app-builder-python', displayName: 'Python', description: null });
  await assert.rejects(ProjectService.prototype.create.call({ agentService: service }, { agentId: 'python-id' }, 'tenant'), BadRequestException);
  await assert.rejects(ProjectService.prototype.duplicate.call({ agentService: service,
    findOne: async () => ({ agentId: 'python-id' }) }, 'source', 'tenant'), BadRequestException);
  service.findIdByName = async () => 'python-id';
  await assert.rejects((ProjectImportService.prototype as any).resolveAgent.call({ agentService: service }, 'app-builder-python'), BadRequestException);
  process.env.ENABLED_PROJECT_RECIPES = 'fastapi@1';
  await assert.rejects(service.assertCreatable('python-id'), BadRequestException);
  // Existing projects still resolve their stored profile.
  assert.equal((await service.findById('python-id')).name, 'app-builder-python');
});

test('the agent catalog hides disabled profiles even when their database rows remain', async t => {
  const original = db.select;
  const previous = process.env.ENABLED_PROJECT_RECIPES;
  process.env.ENABLED_PROJECT_RECIPES = 'fastapi@1';
  t.after(() => {
    db.select = original;
    if (previous === undefined) delete process.env.ENABLED_PROJECT_RECIPES; else process.env.ENABLED_PROJECT_RECIPES = previous;
  });
  const rows = ['app-builder', 'app-builder-python', 'app-builder-go'].map(name => ({ id: name, name, displayName: name, description: null }));
  db.select = (() => ({ from: () => ({ orderBy: async () => rows }) })) as unknown as typeof db.select;
  assert.deepEqual((await new AgentService().findAll()).map(agent => agent.name), ['app-builder']);
});
