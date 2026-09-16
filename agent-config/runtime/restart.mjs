import { setTimeout } from 'node:timers/promises';
import { RuntimeConfigError } from './project-runtime.mjs';

function port(value, fallback) {
  const text = value ?? fallback;
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 65535) {
    throw new RuntimeConfigError('INVALID_PORT', 'App and control ports must be valid TCP ports');
  }
  return text;
}

export async function restartApp(env = process.env, { timeoutMs = 120000, intervalMs = 500 } = {}) {
  if (!env.OPSIFORCE_CONTROL_TOKEN) throw new RuntimeConfigError('CONTROL_UNAVAILABLE', 'The platform restart token is unavailable');
  const control = port(env.CONTROL_PORT, '4910');
  const app = port(env.APP_PORT, '3000');
  let result;
  try {
    const response = await fetch(`http://127.0.0.1:${control}/restart-app`, {
      method: 'POST', headers: { 'x-control-token': env.OPSIFORCE_CONTROL_TOKEN }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error();
    result = await response.json();
  } catch {
    throw new RuntimeConfigError('RESTART_FAILED', 'Platform restart failed; check agent-control and application logs');
  }
  if (!Number.isInteger(result?.killed) || result.killed < 1) {
    throw new RuntimeConfigError('APP_NOT_SUPERVISED', 'No supervised app process was found; check the startup guard');
  }
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const response = await fetch(`http://127.0.0.1:${app}/api/health`, { signal: AbortSignal.timeout(Math.max(1, Math.min(3000, deadline - Date.now()))) });
      if (response.ok && (await response.json()).status === 'ok') return { status: 'ready', restartedProcesses: result.killed };
    } catch { /* A new process may still be compiling or installing dependencies. */ }
    if (Date.now() < deadline) await setTimeout(Math.min(intervalMs, deadline - Date.now()));
  } while (Date.now() < deadline);
  throw new RuntimeConfigError('APP_NOT_READY', 'Restart was requested but app health did not recover; inspect dependency, build and application logs');
}
