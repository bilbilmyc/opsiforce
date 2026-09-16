import { chmod, cp, mkdir, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRecipes, RuntimeConfigError } from './project-runtime.mjs';

/** Explicit creation only. Never overlays an existing app, including an empty one. */
export async function scaffold(workspace, selection) {
  const recipe = listRecipes().recipes.find(r => `${r.id}@${r.version}` === selection && r.template);
  if (!recipe || recipe.status === 'planned') {
    throw new RuntimeConfigError('TEMPLATE_UNAVAILABLE', 'Select an implemented template using recipe@version');
  }
  const root = await realpath(workspace);
  const app = path.join(root, 'app');
  try { await mkdir(app); }
  catch (error) {
    if (error.code === 'EEXIST') throw new RuntimeConfigError('APP_EXISTS', 'app already exists; use a new workspace or adapt the existing project manually');
    throw error;
  }
  // Exclusive mkdir is the ownership check. No force option or implicit migration.
  // Leave partial output inspectable on IO failure, rather than deleting user files.
  const source = fileURLToPath(new URL(`./templates/${recipe.template}/`, import.meta.url));
  for (const name of await readdir(source)) {
    await cp(path.join(source, name), path.join(app, name),
      { recursive: true, force: false, errorOnExist: true });
  }
  for (const script of ['startup.sh', 'run-backend.sh']) await chmod(path.join(app, script), 0o755);
  return { recipe: `${recipe.id}@${recipe.version}`, directory: app, status: recipe.status };
}
