#!/usr/bin/env node
import process from 'node:process';
import { listRecipes, resolveStartup, RuntimeConfigError } from './project-runtime.mjs';
import { scaffold } from './scaffold.mjs';
import { isBootstrap } from './bootstrap.mjs';
import { setTimeout } from 'node:timers/promises';
import { restartApp } from './restart.mjs';

try {
  const [command, ...rest] = process.argv.slice(2);
  if (!(command === 'init' ? rest.length === 1 : rest.length === 0 && ['recipes', 'inspect', 'run', 'restart'].includes(command))) {
    throw new RuntimeConfigError('USAGE', 'Usage: opsiforce-runtime recipes|inspect|run|restart or init recipe@version (WORKSPACE defaults to /workspace)');
  }
  if (command === 'restart') {
    console.log(JSON.stringify(await restartApp(), null, 2));
  } else if (command === 'init') {
    console.log(JSON.stringify(await scaffold(process.env.WORKSPACE || '/workspace', rest[0]), null, 2));
  } else if (command === 'recipes') {
    console.log(JSON.stringify(listRecipes(), null, 2));
  } else {
    const workspace = process.env.WORKSPACE || '/workspace';
    if (command === 'inspect' && await isBootstrap(workspace)) {
      console.log(JSON.stringify({ source: 'bootstrap', status: 'awaiting-initialization' }));
      process.exit(0);
    }
    if (command === 'run' && await isBootstrap(workspace)) {
      console.log('Waiting for App Builder to initialize the requested stack');
      while (await isBootstrap(workspace)) await setTimeout(500);
    }
    const plan = await resolveStartup(workspace);
    if (command === 'inspect') {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      if (typeof process.execve !== 'function') throw new RuntimeConfigError('UNSUPPORTED_NODE', 'This runtime requires Node.js with process.execve');
      process.chdir(plan.cwd);
      // Replace this process, preserving PID, inherited env, signals and guard's
      // exit status. Existing startup scripts retain their app-* inner guards.
      process.execve(plan.script, [plan.script], process.env);
    }
  }
} catch (error) {
  console.error(JSON.stringify({
    stage: 'startup-config',
    code: error instanceof RuntimeConfigError ? error.code : 'STARTUP_FAILED',
    message: error instanceof RuntimeConfigError ? error.message : 'Could not complete the runtime command',
  }));
  process.exitCode = 1;
}
