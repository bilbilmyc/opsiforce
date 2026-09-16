import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuntimeConfigError } from './project-runtime.mjs';

export const bootstrapDirectory = fileURLToPath(new URL('./bootstrap/', import.meta.url));
const marker = '.opsiforce-bootstrap';

export async function isBootstrap(workspace) {
  const target = path.join(workspace, 'app', marker);
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.size > 128 || await readFile(target, 'utf8') !== await readFile(path.join(bootstrapDirectory, marker), 'utf8')) {
      throw new RuntimeConfigError('INVALID_BOOTSTRAP', 'Workspace bootstrap marker is invalid');
    }
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Accept only the platform's untouched workspace plus platform-created data/config. */
export async function assertPristineBootstrap(workspace) {
  const app = path.join(workspace, 'app');
  if (!(await lstat(app)).isDirectory() || !await isBootstrap(workspace)) {
    throw new RuntimeConfigError('APP_EXISTS', 'Existing application source is preserved; initialization requires a new workspace');
  }
  for (const name of await readdir(app)) {
    const info = await lstat(path.join(app, name));
    if (name === 'data' && info.isDirectory()) continue;
    if (name === 'opsiforce.env.json' && info.isFile()) continue;
    if ([marker, '.gitignore'].includes(name) && info.isFile() && info.size < 4096 &&
        (await readFile(path.join(app, name))).equals(await readFile(path.join(bootstrapDirectory, name)))) continue;
    throw new RuntimeConfigError('APP_EXISTS', 'Workspace contains edited or additional files; initialization preserves them');
  }
}
