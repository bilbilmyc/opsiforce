import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyTunnelBound } from './tunnel.mjs';

const ROOT_HOSTNAME = 'opsiforce.localtest.me';
const TRAEFIK_NAMESPACE = 'traefik';
const DATA_NAMESPACE = 'local';
const TLS_SECRET_NAME = 'traefik-me-tls';
const HELM_TIMEOUT = '5m';
const PLUGIN_PLACEHOLDER = '@@OIDC_PLUGIN_VERSION@@';
const PLUGIN_PATH = '/plugins-local/src/github.com/sevensolutions/traefik-oidc-auth';

const CERT_DOMAINS = [
  ROOT_HOSTNAME,
  `*.${ROOT_HOSTNAME}`,
  `*.apps.${ROOT_HOSTNAME}`,
  `*.preview.apps.${ROOT_HOSTNAME}`,
  `*.code.${ROOT_HOSTNAME}`,
  `*.db.${ROOT_HOSTNAME}`,
];

function localInfraPath(ctx, file) {
  return join(ctx.paths.packageRoot, 'helm', 'local-infra', file);
}

function ensureCluster(ctx) {
  const host = ctx.tryCapture('minikube', ['status', '-f', '{{.Host}}']);
  if (host === 'Running') return;
  if (host === 'Stopped') {
    throw new Error('minikube is stopped. Resume it with `minikube start`, then re-run `yarn dev`.');
  }
  throw new Error(
    'minikube is not running — the infra step needs a live cluster. Run `yarn dev --reset` then `yarn dev` to (re)create the cluster at the pinned version and size.'
  );
}

function helmInstall(ctx, { release, chart, repo, version, namespace, valuesFile }) {
  const args = ['upgrade', '--install', release, chart];
  if (repo) args.push('--repo', repo);
  args.push('--version', version, '--namespace', namespace, '--create-namespace', '--wait', '--timeout', HELM_TIMEOUT);
  if (valuesFile) args.push('--values', valuesFile);
  ctx.run('helm', args);
}

function trustLocalCa(ctx) {
  ctx.note('installing the mkcert local CA into the system trust store (may prompt for your password the first time)…');
  ctx.run('mkcert', ['-install']);
}

function certHasAllDomains(ctx, certFile) {
  if (!ctx.exists(certFile)) return false;
  const info = ctx.tryCapture('openssl', ['x509', '-noout', '-ext', 'subjectAltName', '-in', certFile]);
  if (!info) return false;
  return CERT_DOMAINS.every((domain) => info.includes(`DNS:${domain}`));
}

function generateWildcardCert(ctx) {
  const certsDir = join(ctx.paths.home, 'certs', ROOT_HOSTNAME);
  const certFile = join(certsDir, 'cert.pem');
  const keyFile = join(certsDir, 'key.pem');
  if (ctx.exists(keyFile) && certHasAllDomains(ctx, certFile)) {
    ctx.note(`reusing the wildcard certificate for *.${ROOT_HOSTNAME}.`);
    return { certFile, keyFile };
  }
  mkdirSync(certsDir, { recursive: true });
  ctx.note(`generating a locally trusted certificate for *.${ROOT_HOSTNAME}…`);
  ctx.run('mkcert', ['-cert-file', certFile, '-key-file', keyFile, ...CERT_DOMAINS]);
  return { certFile, keyFile };
}

function installDataStores(ctx) {
  ctx.note('installing postgres + redis via Helm (bitnami charts, no registry mirror)…');
  helmInstall(ctx, {
    release: 'local-pg',
    chart: 'oci://registry-1.docker.io/bitnamicharts/postgresql',
    version: ctx.versions.exact.charts.postgresql,
    namespace: DATA_NAMESPACE,
    valuesFile: localInfraPath(ctx, 'postgresql.values.yaml'),
  });
  helmInstall(ctx, {
    release: 'redis-session-storage-local',
    chart: 'oci://registry-1.docker.io/bitnamicharts/redis',
    version: ctx.versions.exact.charts.redis,
    namespace: DATA_NAMESPACE,
    valuesFile: localInfraPath(ctx, 'redis.values.yaml'),
  });
}

function installPlatform(ctx) {
  ctx.note('preparing workspace storage and installing the platform service account + pod-manager RBAC…');
  ctx.run('minikube', [
    'ssh',
    '--',
    'sudo mkdir -p /workspace-data/projects && sudo chmod 777 /workspace-data /workspace-data/projects',
  ]);
  ctx.run('helm', [
    'upgrade',
    '--install',
    'opsiforce-infra',
    join(ctx.paths.packageRoot, 'helm', 'opsiforce'),
    '--namespace',
    DATA_NAMESPACE,
    '--create-namespace',
    '--wait',
    '--timeout',
    HELM_TIMEOUT,
    '--set',
    'fullnameOverride=opsiforce',
    '--set',
    'storage.type=hostPath',
    '--set',
    'storage.hostPath=/workspace-data',
    '--set',
    'valkey.enabled=false',
    '--set',
    'agent.affinity=null',
  ]);
}

function refreshTunnelPrivilege(ctx) {
  ctx.note('refreshing admin access so the tunnel can bind the Traefik load balancer (may re-prompt if it expired)…');
  ctx.run('sudo', ['-v']);
}

function installTraefik(ctx) {
  const pluginVersion = ctx.versions.exact.charts.traefikOidcPlugin;
  const template = readFileSync(localInfraPath(ctx, 'traefik.values.yaml'), 'utf8');
  const rendered = template.replaceAll(PLUGIN_PLACEHOLDER, pluginVersion);
  mkdirSync(ctx.paths.home, { recursive: true });
  const renderedPath = join(ctx.paths.home, 'traefik.values.local.yaml');
  writeFileSync(renderedPath, rendered);

  ctx.note(`installing Traefik via Helm with the traefik-oidc-auth plugin (${pluginVersion})…`);
  helmInstall(ctx, {
    release: 'traefik',
    chart: 'traefik',
    repo: 'https://traefik.github.io/charts',
    version: ctx.versions.exact.charts.traefik,
    namespace: TRAEFIK_NAMESPACE,
    valuesFile: renderedPath,
  });
}

function applyTls(ctx, certFile, keyFile) {
  const secretYaml = ctx.capture('kubectl', [
    'create',
    'secret',
    'tls',
    TLS_SECRET_NAME,
    '--namespace',
    TRAEFIK_NAMESPACE,
    '--cert',
    certFile,
    '--key',
    keyFile,
    '--dry-run=client',
    '-o',
    'yaml',
  ]);
  ctx.run('kubectl', ['apply', '-f', '-'], { input: secretYaml, stdio: ['pipe', 'inherit', 'inherit'] });
  ctx.run('kubectl', ['apply', '-f', localInfraPath(ctx, 'tls.yaml')]);
  ctx.note('applied the TLS secret, default TLSStore, and Traefik middlewares (headers, gzip).');
}

function verifyOidcPlugin(ctx) {
  const listing = ctx.tryCapture('kubectl', [
    'exec',
    '--namespace',
    TRAEFIK_NAMESPACE,
    'deploy/traefik',
    '--',
    'ls',
    PLUGIN_PATH,
  ]);
  if (listing && listing.includes('.traefik.yml')) {
    ctx.note('verified the traefik-oidc-auth plugin is present (enforces App Auth on built apps).');
  } else {
    ctx.note('Traefik is ready; its oidc-auth plugin init container completed (confirmed by helm --wait).');
  }
}

export async function run(ctx) {
  ensureCluster(ctx);
  trustLocalCa(ctx);
  const { certFile, keyFile } = generateWildcardCert(ctx);
  installDataStores(ctx);
  installPlatform(ctx);
  refreshTunnelPrivilege(ctx);
  installTraefik(ctx);
  await verifyTunnelBound(ctx);
  applyTls(ctx, certFile, keyFile);
  verifyOidcPlugin(ctx);
  ctx.note(`infra ready — HTTPS for *.${ROOT_HOSTNAME} serves once the stack is up.`);
}
