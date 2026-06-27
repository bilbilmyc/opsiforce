import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const tilde = (path) => (path.startsWith(homedir()) ? path.replace(homedir(), '~') : path);

function ensureCluster(ctx) {
  const host = ctx.tryCapture('minikube', ['status', '-f', '{{.Host}}']);
  if (host === 'Running') return;
  if (host === 'Stopped') {
    throw new Error('minikube is stopped. Resume it with `minikube start`, then re-run `yarn dev`.');
  }
  throw new Error(
    'minikube is not running — the tunnel needs a live cluster. Run `yarn dev --reset` then `yarn dev`.'
  );
}

function alreadyRunning(ctx) {
  const pids = ctx.tryCapture('pgrep', ['-f', 'minikube tunnel']);
  return Boolean(pids && pids.trim());
}

function killTunnels() {
  try {
    execFileSync('pkill', ['-f', 'minikube tunnel'], { stdio: 'ignore' });
  } catch {
    void 0;
  }
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForBind(host, port, attempts) {
  for (let i = 0; i < attempts; i++) {
    if (await canConnect(host, port)) return true;
    await delay(1000);
  }
  return false;
}

function logTail(file) {
  try {
    return readFileSync(file, 'utf8').trim().split('\n').slice(-8).join('\n');
  } catch {
    return '';
  }
}

function tunnelPid(ctx) {
  try {
    return readFileSync(ctx.paths.tunnelPid, 'utf8').trim();
  } catch {
    return '';
  }
}

function ingressLbReady(ctx) {
  const ips = ctx.tryCapture('kubectl', [
    'get',
    'svc',
    '-A',
    '-o',
    'jsonpath={range .items[?(@.spec.type=="LoadBalancer")]}{.status.loadBalancer.ingress[*].ip}{" "}{end}',
  ]);
  return Boolean(ips && ips.trim());
}

export async function verifyTunnelBound(ctx) {
  const logFile = join(ctx.paths.logs, 'tunnel.log');
  if (await waitForBind('127.0.0.1', 443, 30)) {
    ctx.note('the tunnel is bound to :80/:443 — the cluster ingress is reachable.');
    return;
  }
  const pid = tunnelPid(ctx);
  const tail = logTail(logFile);
  throw new Error(
    `The network tunnel is running${pid ? ` (pid ${pid})` : ''} but nothing is listening on :443 after 30s — the privileged port-bind did not take, so the cluster ingress is unreachable.${tail ? `\n\n${tail}` : ''}\n\nRe-run \`yarn dev\` to re-establish the tunnel (it prompts for admin access again).`
  );
}

export async function run(ctx) {
  ensureCluster(ctx);

  mkdirSync(ctx.paths.logs, { recursive: true });
  const logFile = join(ctx.paths.logs, 'tunnel.log');

  if (alreadyRunning(ctx)) {
    if (await waitForBind('127.0.0.1', 443, 3)) {
      ctx.note('minikube tunnel is already running and bound — reusing it (no admin prompt needed).');
      return;
    }
    ctx.warn('A minikube tunnel is running but nothing is bound to :443 — restarting it.');
    killTunnels();
    await delay(1000);
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      'The network tunnel needs an interactive terminal for its one-time admin prompt. Run `yarn dev` in a terminal.'
    );
  }

  ctx.print(ctx.c.bold('The network tunnel needs administrator access once.'));
  ctx.print(ctx.c.dim('This is the only privileged step — macOS prompts for your password so traffic to'));
  ctx.print(ctx.c.dim('the cluster can be routed. The tunnel then runs in the background.'));
  ctx.print('');

  ctx.run('sudo', ['-v']);

  const out = openSync(logFile, 'a');
  const child = spawn('nohup', ['minikube', 'tunnel'], { detached: false, stdio: ['ignore', out, out] });

  let exitedWith = null;
  child.on('exit', (code, signal) => {
    exitedWith = signal ?? code;
  });
  child.on('error', (error) => {
    exitedWith = error.message;
  });
  child.unref();

  if (typeof child.pid === 'number') {
    writeFileSync(ctx.paths.tunnelPid, `${child.pid}\n`);
  }

  await delay(2500);
  if (exitedWith !== null) {
    const tail = logTail(logFile);
    throw new Error(
      `minikube tunnel exited right after starting (${exitedWith}).${tail ? `\n\n${tail}` : ''}\n\nRe-run \`yarn dev\`.`
    );
  }

  if (ingressLbReady(ctx)) {
    await verifyTunnelBound(ctx);
    return;
  }

  ctx.note(
    `tunnel running in the background (pid ${child.pid}); it binds :80/:443 once Traefik's load balancer comes up in the next step. logs at ${tilde(logFile)}.`
  );
}
