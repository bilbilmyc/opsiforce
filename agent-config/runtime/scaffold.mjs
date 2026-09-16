import { chmod, cp, lstat, mkdir, readdir, realpath, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRecipes, RuntimeConfigError } from './project-runtime.mjs';
import { assertPristineBootstrap } from './bootstrap.mjs';

/** Initialize once, without overwriting any existing application source or data. */
export async function scaffold(workspace, selection) {
  const recipe = listRecipes().recipes.find(r => `${r.id}@${r.version}` === selection && r.template);
  if (!recipe || recipe.status === 'planned') {
    throw new RuntimeConfigError('TEMPLATE_UNAVAILABLE', 'Select an implemented template using recipe@version');
  }
  const root = await realpath(workspace);
  const app = path.join(root, 'app');
  let bootstrap = false;
  try { await mkdir(app); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await assertPristineBootstrap(root);
    bootstrap = true;
  }
  // Serialize bootstrap initialization. A failed copy remains inspectable and is
  // never retried destructively; the waiting runtime cannot run partial source.
  const lock = path.join(app, '.opsiforce-initializing');
  if (bootstrap) {
    try { await mkdir(lock); }
    catch { throw new RuntimeConfigError('INIT_IN_PROGRESS', 'Workspace initialization is already in progress or needs inspection'); }
  }
  const source = fileURLToPath(new URL(`./templates/${recipe.template}/`, import.meta.url));
  for (const name of await readdir(source)) {
    if (bootstrap && name === '.gitignore') continue; // universal ignore rules already installed
    await cp(path.join(source, name), path.join(app, name),
      { recursive: true, force: false, errorOnExist: true });
  }
  for (const script of ['startup.sh', 'run-backend.sh']) {
    try { await lstat(path.join(app, script)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await chmod(path.join(app, script), 0o755);
  }
  if (bootstrap) {
    // Removal is the activation point: run waits until every file is installed.
    await unlink(path.join(app, '.opsiforce-bootstrap'));
    await rmdir(lock);
  }
  return { recipe: `${recipe.id}@${recipe.version}`, directory: app, status: recipe.status };
}
