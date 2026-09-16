#!/usr/bin/env node
import process from 'node:process';
import { listRecipes, resolveStartup, RuntimeConfigError } from './project-runtime.mjs';

try {
  const [command, ...rest] = process.argv.slice(2);
  if (rest.length || !['recipes', 'inspect', 'run'].includes(command)) {
    throw new RuntimeConfigError('USAGE', 'Usage: opsiforce-runtime recipes|inspect|run (WORKSPACE defaults to /workspace)');
  }
  if (command === 'recipes') {
    console.log(JSON.stringify(listRecipes(), null, 2));
  } else {
    const plan = await resolveStartup(process.env.WORKSPACE || '/workspace');
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
    message: error instanceof RuntimeConfigError ? error.message : 'Could not launch the project startup script',
  }));
  process.exitCode = 1;
}
