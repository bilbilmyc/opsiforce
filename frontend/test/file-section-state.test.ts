import { expect, test } from 'bun:test';
import { defaultFileSection } from '../src/components/project/files/file-section-state';
import type { FilesRootListing, FilesSectionKey } from '../src/api/files';
const listing = (counts: Partial<Record<FilesSectionKey, number>>): FilesRootListing => ({
  kind: 'root', path: '', sections: (['generated', 'uploads', 'other'] as const).map(key => ({key, path: key === 'other' ? '' : key, entries: Array.from({length: counts[key] ?? 0}, () => ({name:'project',path:'project',type:'directory',size:0,modifiedAt:''}))})),
});
test('project source is visible by default when generated_files is empty', () => {
  expect(defaultFileSection(listing({other:1}))).toBe('other');
});
test('choose populated output or uploads when no project source exists', () => {
  expect(defaultFileSection(listing({generated:2}))).toBe('generated');
  expect(defaultFileSection(listing({uploads:1}))).toBe('uploads');
});
test('prefer project files when multiple categories exist, and handle empty/loading state', () => {
  expect(defaultFileSection(listing({other:1,generated:2,uploads:3}))).toBe('other');
  expect(defaultFileSection(listing({}))).toBe('other');
  expect(defaultFileSection()).toBe('other');
});
