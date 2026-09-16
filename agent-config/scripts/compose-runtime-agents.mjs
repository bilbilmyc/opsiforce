#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../runtime/scaffold.mjs';

/** Build-time bindings reuse runtime templates; existing agents stay untouched. */
export async function composeRuntimeAgents(agentsRoot) {
  const registry = JSON.parse(await readFile(path.join(agentsRoot, 'agents.json'), 'utf8'));
  const instructions = fileURLToPath(new URL('../runtime/instructions/', import.meta.url));
  const composed = [];
  for (const [name, entry] of Object.entries(registry.agents)) {
    if (!entry.recipe) continue;
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid runtime agent name');
    const root = path.join(agentsRoot, name);
    await mkdir(path.join(root, 'template'), { recursive: true });
    const result = await scaffold(path.join(root, 'template'), entry.recipe);
    const recipe = JSON.parse(await readFile(path.join(result.directory, 'opsiforce.project.json'), 'utf8')).recipe.id;
    const [common, specific] = await Promise.all([
      readFile(path.join(instructions, 'backend.md'), 'utf8'),
      readFile(path.join(instructions, `${recipe}.md`), 'utf8'),
    ]);
    await writeFile(path.join(root, 'agent.md'), `${common.trim()}\n\n${specific.trim()}\n`, { flag: 'wx' });
    composed.push({ name, recipe: entry.recipe });
  }
  return composed;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv[2]) throw new Error('Usage: compose-runtime-agents.mjs <agentsRoot>');
  console.log(JSON.stringify(await composeRuntimeAgents(process.argv[2])));
}
