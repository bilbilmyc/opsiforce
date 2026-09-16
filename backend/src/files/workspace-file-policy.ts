import { GENERATED_FILES_DIRECTORY_NAME, USER_UPLOADS_DIRECTORY_NAME } from './file-paths';

const MANAGED_SECTIONS = new Set([GENERATED_FILES_DIRECTORY_NAME, USER_UPLOADS_DIRECTORY_NAME]);
// Only these non-secret dotfiles may be read. Dot directories remain private.
const SOURCE_DOTFILES = new Set(['.gitignore', '.dockerignore', '.editorconfig']);
const DEPENDENCY_DIRECTORIES = new Set(['node_modules', '__pycache__']);

/** Apply to canonical workspace-relative paths, including resolved read targets. */
export function isPrivateWorkspacePath(relativePath: string): boolean {
  const parts = relativePath.split('/');
  if (parts[0] === 'data' || (parts[0] === 'app' && parts[1] === 'data')) return true;
  return parts.some((part, i) =>
    part === 'opsiforce.env.json' ||
    (part.startsWith('.') && !(i === parts.length - 1 && SOURCE_DOTFILES.has(part)))
  );
}

/** Curation is separate from read access: existing source download links keep working. */
export function isListedWorkspacePath(relativePath: string, directory: boolean): boolean {
  if (isPrivateWorkspacePath(relativePath)) return false;
  const parts = relativePath.split('/');
  if (directory && parts.at(-1)!.startsWith('.')) return false;
  // Do not guess that src/data, build, target, vendor, etc. contain disposable files.
  return !parts.some((part, i) => DEPENDENCY_DIRECTORIES.has(part) && (directory || i < parts.length - 1));
}

/** All project source (including legacy roots) is read-only in the Files surface. */
export function canDeleteWorkspacePath(relativePath: string): boolean {
  const parts = relativePath.split('/');
  return parts.length > 1 && MANAGED_SECTIONS.has(parts[0]) && !isPrivateWorkspacePath(relativePath);
}
