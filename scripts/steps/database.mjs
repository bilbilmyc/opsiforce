const NAMESPACE = 'local';
const PG_SERVICE = 'local-pg-postgresql';
const PG_PORT = '5432';
const PG_USER = 'admin';
const PG_PASSWORD = 'dbpass1';
const PSQL_IMAGE = 'postgres:16';
const BACKEND_IMAGE = 'opsiforce-backend:dev';
const DATABASES = ['opsiforce', 'bifrost'];

function ensureCluster(ctx) {
  const host = ctx.tryCapture('minikube', ['status', '-f', '{{.Host}}']);
  if (host === 'Running') return;
  if (host === 'Stopped') {
    throw new Error('minikube is stopped. Resume it with `minikube start`, then re-run `yarn dev`.');
  }
  throw new Error(
    'minikube is not running — the database step needs a live cluster. Run `yarn dev --reset` then `yarn dev`.'
  );
}

function runPod(ctx, name, { image, pullPolicy, env, command }) {
  ctx.tryCapture('kubectl', ['delete', 'pod', name, '--namespace', NAMESPACE, '--ignore-not-found']);
  const args = ['run', name, '--namespace', NAMESPACE, '--restart=Never', '--rm', '-i', `--image=${image}`];
  if (pullPolicy) args.push(`--image-pull-policy=${pullPolicy}`);
  for (const [key, value] of Object.entries(env ?? {})) args.push(`--env=${key}=${value}`);
  args.push('--command', '--', ...command);
  ctx.run('kubectl', args);
}

function createDatabase(ctx, name) {
  const psql = `psql -h ${PG_SERVICE} -U ${PG_USER} -d postgres`;
  const exists = `${psql} -tAc "SELECT 1 FROM pg_database WHERE datname='${name}'"`;
  const script = `${exists} | grep -q 1 || ${psql} -c "CREATE DATABASE ${name}"`;
  ctx.note(`ensuring the ${name} database exists…`);
  runPod(ctx, `quickstart-createdb-${name}`, {
    image: PSQL_IMAGE,
    env: { PGPASSWORD: PG_PASSWORD },
    command: ['sh', '-c', script],
  });
}

function runMigrations(ctx) {
  const databaseUrl = `postgres://${PG_USER}:${PG_PASSWORD}@${PG_SERVICE}:${PG_PORT}/opsiforce`;
  ctx.note('applying drizzle migrations to the opsiforce database (from the backend image)…');
  runPod(ctx, 'quickstart-migrate', {
    image: BACKEND_IMAGE,
    pullPolicy: 'Never',
    env: { DATABASE_URL: databaseUrl },
    command: ['yarn', 'db:migrate'],
  });
}

export async function run(ctx) {
  ensureCluster(ctx);
  for (const name of DATABASES) createDatabase(ctx, name);
  runMigrations(ctx);
  ctx.note('databases created; opsiforce schema migrated (bifrost migrates its own schema on install).');
}
