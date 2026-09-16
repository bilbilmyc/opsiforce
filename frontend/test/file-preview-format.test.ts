import { expect, test } from 'bun:test';
import { filePreviewKind, textPreviewLanguage } from '../src/components/project/preview/file-preview-format';

test('multi-language source and build manifests open as text instead of download-only cards', () => {
  for (const name of ['App.tsx', 'App.vue', 'page.tsx', 'main.py', 'main.go', 'main.rs', 'Main.java',
    'Dockerfile', '.gitignore', '.dockerignore', '.editorconfig', 'go.mod', 'go.sum', 'Cargo.lock',
    'uv.lock', 'build.gradle', 'build.gradle.kts', 'mvnw', 'gradlew']) {
    expect(filePreviewKind(name)).toBe('text');
  }
  expect(textPreviewLanguage('Cargo.lock')).toBe('toml');
  expect(textPreviewLanguage('Dockerfile')).toBe('dockerfile');
  expect(filePreviewKind('report.pdf')).toBe('pdf');
  expect(filePreviewKind('archive.zip')).toBe('unsupported');
});
