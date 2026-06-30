import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const NAMESPACE = 'local';
const RELEASE = 'opsiforce-bifrost';
const CHART = 'bifrost/bifrost';
const REPO_NAME = 'bifrost';
const REPO_URL = 'https://maximhq.github.io/bifrost/helm-charts';
const HELM_TIMEOUT = '5m';

const ADMIN_USERNAME = 'opsiforce-admin';
const ADMIN_PASSWORD = 'opsiforce-local-admin';
const POSTGRES_PASSWORD = 'dbpass1';

const PROVIDER_KEYS_SECRET = 'opsiforce-bifrost-provider-keys';
const ADMIN_SECRET = 'opsiforce-bifrost-admin-auth';
const ENCRYPTION_SECRET = 'opsiforce-bifrost-encryption';
const POSTGRES_SECRET = 'opsiforce-bifrost-postgres';

function chartPath(ctx, file) {
  return join(ctx.paths.packageRoot, 'helm', 'bifrost', file);
}

function ensureCluster(ctx) {
  const host = ctx.tryCapture('minikube', ['status', '-f', '{{.Host}}']);
  if (host === 'Running') return;
  if (host === 'Stopped') {
    throw new Error('minikube is stopped. Resume it with `minikube start`, then re-run `yarn dev`.');
  }
  throw new Error(
    'minikube is not running — the gateway step needs a live cluster. Run `yarn dev --reset` then `yarn dev`.'
  );
}

function ensureChartRepo(ctx) {
  const repos = ctx.tryCapture('helm', ['repo', 'list', '-o', 'json']);
  const known = repos ? JSON.parse(repos).some((entry) => entry.name === REPO_NAME) : false;
  if (!known) {
    ctx.run('helm', ['repo', 'add', REPO_NAME, REPO_URL]);
  }
  ctx.run('helm', ['repo', 'update', REPO_NAME]);
}

function applySecret(ctx, name, literals) {
  const args = ['create', 'secret', 'generic', name, '--namespace', NAMESPACE];
  for (const [key, value] of Object.entries(literals)) args.push(`--from-literal=${key}=${value}`);
  args.push('--dry-run=client', '-o', 'yaml');
  const yaml = ctx.capture('kubectl', args);
  ctx.run('kubectl', ['apply', '-f', '-'], { input: yaml, stdio: ['pipe', 'inherit', 'inherit'] });
}

function resolveEncryptionKey(ctx) {
  const keyFile = join(ctx.paths.home, 'bifrost-encryption.key');
  if (ctx.exists(keyFile)) return readFileSync(keyFile, 'utf8').trim();
  const key = randomBytes(32).toString('hex');
  mkdirSync(ctx.paths.home, { recursive: true });
  writeFileSync(keyFile, `${key}\n`, { mode: 0o600 });
  ctx.note('generated a Bifrost encryption key (persisted to ~/.opsiforce, reused on re-runs).');
  return key;
}

function ensureSecrets(ctx) {
  applySecret(ctx, PROVIDER_KEYS_SECRET, { 'openai-api-key': '', 'anthropic-api-key': '' });
  applySecret(ctx, ADMIN_SECRET, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  applySecret(ctx, ENCRYPTION_SECRET, { key: resolveEncryptionKey(ctx) });
  applySecret(ctx, POSTGRES_SECRET, { password: POSTGRES_PASSWORD });
  ctx.note('Bifrost secrets in place (admin auth, encryption key, postgres password, empty provider keys).');
}

function installGateway(ctx) {
  ctx.note(`installing Bifrost ${ctx.versions.exact.charts.bifrost} via Helm…`);
  ctx.run('helm', [
    'upgrade',
    '--install',
    RELEASE,
    CHART,
    '--version',
    ctx.versions.exact.charts.bifrost,
    '--namespace',
    NAMESPACE,
    '--create-namespace',
    '--wait',
    '--timeout',
    HELM_TIMEOUT,
    '--values',
    chartPath(ctx, 'values.local.yaml'),
  ]);
}

function applyNetworkPolicy(ctx) {
  ctx.run('kubectl', ['apply', '--namespace', NAMESPACE, '-f', chartPath(ctx, 'networkpolicy.yaml')]);
  ctx.note('network policy applied — ingress for in-cluster callers, egress open to host.minikube.internal.');
}

export async function run(ctx) {
  ensureCluster(ctx);
  ensureChartRepo(ctx);
  ensureSecrets(ctx);
  installGateway(ctx);
  applyNetworkPolicy(ctx);
  ctx.note(`Bifrost reachable in-cluster at http://${RELEASE}:8080/v1; the LLM step points its provider upstream.`);
}
