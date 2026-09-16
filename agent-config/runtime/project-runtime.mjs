import { constants } from 'node:fs';
import { access, lstat, open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import registry from './recipes.json' with { type: 'json' };
import schema from './project.schema.json' with { type: 'json' };

const MANIFEST = 'app/opsiforce.project.json';
const MAX_MANIFEST_BYTES = 64 * 1024;

export class RuntimeConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fail(code, message) {
  throw new RuntimeConfigError(code, message);
}

// This schema uses only object, string, integer, const and pattern constraints.
// Interpret that bounded subset so the image needs no package installation and
// the documented JSON Schema remains the validation source of truth.
function validate(value, rule, location = 'manifest') {
  if (rule.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_MANIFEST', `${location} must be an object`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(rule.properties, key)) fail('INVALID_MANIFEST', `${location} contains unsupported fields`);
    }
    for (const key of rule.required) {
      if (!Object.hasOwn(value, key)) fail('INVALID_MANIFEST', `${location}.${key} is required`);
    }
    for (const [key, entry] of Object.entries(value)) validate(entry, rule.properties[key], `${location}.${key}`);
  } else if (rule.type === 'integer') {
    if (!Number.isInteger(value) || value !== rule.const) fail('INVALID_MANIFEST', `${location} must be ${rule.const}`);
  } else if (rule.type === 'string') {
    if (typeof value !== 'string' || value.includes('\0') ||
      (rule.minLength !== undefined && value.length < rule.minLength) ||
      (rule.maxLength !== undefined && value.length > rule.maxLength) ||
      (rule.pattern && !new RegExp(rule.pattern).test(value))) {
      fail('INVALID_MANIFEST', `${location} is invalid`);
    }
  } else {
    fail('INVALID_SCHEMA', 'Unsupported runtime schema type');
  }
}

export function listRecipes() {
  return structuredClone(registry);
}

export function validateManifest(value) {
  validate(value, schema);
  const recipe = registry.recipes.find(r => r.id === value.recipe.id && r.version === value.recipe.version);
  if (!recipe) fail('UNKNOWN_RECIPE', 'The selected recipe version is not registered');
  if (recipe.status === 'planned' || recipe.runner !== 'startup-script') {
    fail('RECIPE_NOT_IMPLEMENTED', 'The selected recipe is planned but cannot run yet');
  }
  if (recipe.id === 'legacy-startup' && (value.startup.script !== 'app/startup.sh' || value.startup.cwd !== '.')) {
    fail('INVALID_MANIFEST', 'legacy-startup must preserve app/startup.sh and the workspace working directory');
  }
  return { manifest: structuredClone(value), recipe: structuredClone(recipe) };
}

async function withinWorkspace(root, relative, label) {
  if (path.posix.isAbsolute(relative) || relative.includes('\\') || relative.includes('\0') ||
    relative.split('/').some(part => part === '..') || /^[a-z]:/i.test(relative)) {
    fail('INVALID_PATH', `${label} must be a workspace-relative path without traversal`);
  }
  let resolved;
  try { resolved = await realpath(path.join(root, relative)); }
  catch { fail('PATH_UNAVAILABLE', `${label} does not exist or is inaccessible`); }
  if (resolved !== root && !resolved.startsWith(root + path.sep)) fail('PATH_ESCAPE', `${label} escapes the workspace`);
  return resolved;
}

async function readManifest(root) {
  // Check lstat first: a dangling manifest symlink must not trigger legacy fallback.
  try { await lstat(path.join(root, MANIFEST)); }
  catch (error) {
    if (error.code === 'ENOENT') return undefined;
    fail('MANIFEST_UNREADABLE', 'Cannot access the project manifest');
  }
  const target = await withinWorkspace(root, MANIFEST, 'Manifest');
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) fail('INVALID_MANIFEST', 'Manifest must be a regular file of at most 64 KiB');
    const buffer = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_MANIFEST_BYTES) fail('INVALID_MANIFEST', 'Manifest exceeds 64 KiB');
    try { return JSON.parse(buffer.toString('utf8', 0, length)); }
    catch { fail('INVALID_MANIFEST', 'Manifest is not valid JSON'); }
  } catch (error) {
    if (error instanceof RuntimeConfigError) throw error;
    fail('MANIFEST_UNREADABLE', 'Cannot read the project manifest');
  } finally { await handle?.close(); }
}

/** Read-only: never seeds, rewrites or installs anything in an existing project. */
export async function resolveStartup(workspace) {
  let root;
  try { root = await realpath(workspace); }
  catch { fail('WORKSPACE_UNAVAILABLE', 'Workspace does not exist or is inaccessible'); }
  const value = await readManifest(root);
  const { manifest, recipe } = validateManifest(value === undefined ? {
    schemaVersion: 1,
    recipe: { id: 'legacy-startup', version: '1' },
    startup: { script: 'app/startup.sh', cwd: '.' },
  } : value);
  const script = await withinWorkspace(root, manifest.startup.script, 'Startup script');
  const cwd = await withinWorkspace(root, manifest.startup.cwd, 'Working directory');
  if (!(await stat(cwd)).isDirectory()) fail('INVALID_PATH', 'Working directory must be a directory');
  if (!(await stat(script)).isFile()) fail('INVALID_PATH', 'Startup script must be a regular file');
  try { await access(script, constants.X_OK); }
  catch { fail('SCRIPT_NOT_EXECUTABLE', 'Startup script must be executable'); }
  return {
    source: value === undefined ? 'legacy' : 'manifest',
    schemaVersion: 1,
    recipe: { id: recipe.id, version: recipe.version, status: recipe.status },
    script,
    cwd,
  };
}
