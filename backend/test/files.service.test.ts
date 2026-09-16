import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { FilesService } from '../src/files/files.service';
import { WorkspaceFileService } from '../src/files/workspace-file.service';

async function workspace(t: any) {
  const storage = await mkdtemp(path.join(os.tmpdir(), 'opsiforce-files-'));
  t.after(() => rm(storage, { recursive: true, force: true }));
  const root = path.join(storage, 'project');
  await mkdir(root);
  const config = new ConfigService({ storageMountPath: storage });
  const put = async (name: string, content = 'source') => {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  };
  return { root, put, files: new FilesService(config), reader: new WorkspaceFileService(config) };
}

test('Files exposes app and legacy project roots, with no framework-specific registration', async t => {
  const { files, put } = await workspace(t);
  for (const name of ['app/app/page.tsx', 'app/frontend/src/App.vue', 'app/backend/main.py',
    'app/api/main.go', 'app/rust/src/main.rs', 'app/java/src/Main.java', 'fastapi-form-service/main.py']) await put(name);
  const root = await files.list('project', undefined);
  assert.equal(root.kind, 'root');
  if (root.kind !== 'root') return;
  assert.deepEqual(root.sections.find(s => s.key === 'other')!.entries.map(e => e.name), ['app', 'fastapi-form-service']);
  assert.ok(root.sections.find(s => s.key === 'other')!.entries.every(e => e.canDelete === false));
  for (const folder of ['app/app', 'app/frontend/src', 'app/backend', 'app/api', 'app/rust/src', 'app/java/src', 'fastapi-form-service']) {
    const listing = await files.list('project', folder);
    assert.equal(listing.kind, 'directory');
    if (listing.kind === 'directory') assert.equal(listing.entries.length, 1, folder);
  }
});

test('listing filters runtime/private files but preserves source directories called data/build/target', async t => {
  const { files, put } = await workspace(t);
  for (const name of ['app/package.json', 'app/.gitignore', 'app/.env', 'app/.npmrc', 'app/opsiforce.env.json',
    'app/node_modules/pkg/index.js', 'app/.next/cache/file', 'app/__pycache__/module.pyc',
    'app/data/app.db', 'data/database.db', 'app/src/data/model.ts', 'app/src/build/build.ts', 'app/src/target/target.rs']) await put(name);
  const listing = await files.list('project', 'app');
  assert.equal(listing.kind, 'directory');
  if (listing.kind === 'directory') assert.deepEqual(listing.entries.map(e => e.name), ['src', '.gitignore', 'package.json']);
  for (const folder of ['app/src/data', 'app/src/build', 'app/src/target']) {
    const sub = await files.list('project', folder);
    assert.equal(sub.kind === 'directory' && sub.entries.length, 1);
  }
  for (const folder of ['app/node_modules', 'app/.next', 'app/data', 'data']) {
    await assert.rejects(files.list('project', folder));
  }
});

test('only output/upload descendants are deletable; normalized paths cannot bypass source protection', async t => {
  const { files, put, root } = await workspace(t);
  for (const name of ['app/main.py', 'legacy/main.go', 'generated_files/report.txt', 'user_uploaded_files/nested/input.csv']) await put(name);
  for (const name of ['app', 'app/main.py', 'legacy', 'generated_files', 'user_uploaded_files', 'generated_files/../app/main.py']) {
    await assert.rejects(files.remove('project', name), /not deletable/);
  }
  assert.equal(await readFile(path.join(root, 'app/main.py'), 'utf8'), 'source');
  const listing = await files.list('project', 'user_uploaded_files');
  assert.ok(listing.kind === 'directory' && listing.entries[0].canDelete);
  await files.remove('project', 'generated_files/report.txt');
  await files.remove('project', 'user_uploaded_files/nested');
  const outputs = await files.list('project', 'generated_files');
  assert.deepEqual(outputs.kind === 'directory' && outputs.entries, []);
});

test('missing workspace and malformed section fail instead of masquerading as empty', async t => {
  const { files, put } = await workspace(t);
  await assert.rejects(files.list('missing', undefined), /not found/);
  await put('generated_files');
  await assert.rejects(files.list('project', undefined), /directory|load/i);
});

test('absent optional output/upload directories are valid empty sections', async t => {
  const { files } = await workspace(t);
  const listing = await files.list('project', undefined);
  assert.ok(listing.kind === 'root' && listing.sections.every(s => s.entries.length === 0));
});

test('unreadable directory reports a service error rather than an empty listing', { skip: process.getuid?.() === 0 }, async t => {
  const { files, root } = await workspace(t);
  const folder = path.join(root, 'unreadable');
  await mkdir(folder);
  await chmod(folder, 0);
  try {
    await assert.rejects(files.list('project', 'unreadable'), (error: any) => error.getStatus() === 503);
  } finally {
    await chmod(folder, 0o700);
  }
});

test('symlinks cannot expose private paths or make project source deletable through uploads', async t => {
  const { files, put, root } = await workspace(t);
  await put('app/main.py');
  await mkdir(path.join(root, 'user_uploaded_files'));
  await symlink(path.join(root, 'app'), path.join(root, 'user_uploaded_files/source'));
  await symlink(path.join(root, 'app'), path.join(root, 'generated_files'));
  await assert.rejects(files.list('project', 'user_uploaded_files/source'));
  await assert.rejects(files.remove('project', 'user_uploaded_files/source/main.py'));
  await assert.rejects(files.remove('project', 'user_uploaded_files/source'));
  const listing = await files.list('project', undefined);
  assert.ok(listing.kind === 'root' && listing.sections.find(s => s.key === 'generated')!.entries.length === 0);
  assert.equal(await readFile(path.join(root, 'app/main.py'), 'utf8'), 'source');
});

test('known secret/runtime paths are refused by content/download read service', async t => {
  const { reader, put } = await workspace(t);
  for (const name of ['app/opsiforce.env.json', 'app/.env', 'app/.npmrc', 'app/data/app.db', 'data/database.db']) {
    await put(name);
    await assert.rejects(reader.openForRead('project', name));
  }
});

test('Linux read handles allow source/config, reject aliases to private or outside files', { skip: process.platform !== 'linux' }, async t => {
  const { reader, put, root } = await workspace(t);
  await put('app/main.py');
  await put('app/.gitignore');
  await put('app/opsiforce.env.json');
  for (const name of ['app/main.py', 'app/.gitignore']) {
    const file = await reader.openForRead('project', name);
    assert.equal(await file.handle.readFile('utf8'), 'source');
    await file.handle.close();
  }
  await symlink(path.join(root, 'app/opsiforce.env.json'), path.join(root, 'secret.txt'));
  await symlink('/etc/passwd', path.join(root, 'outside.txt'));
  await assert.rejects(reader.openForRead('project', 'secret.txt'));
  await assert.rejects(reader.openForRead('project', 'outside.txt'));
});
