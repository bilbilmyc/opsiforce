export interface UploadFile {
  file: File;
  path: string;
}

export function toUploadFiles(files: FileList | File[]): UploadFile[] {
  return Array.from(files, (file) => ({ file, path: relativePathOf(file) }));
}

export function topLevelEntriesOf(files: UploadFile[]): string[] {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const { path } of files) {
    const top = path.split('/')[0];
    if (!top || seen.has(top)) continue;
    seen.add(top);
    entries.push(top);
  }
  return entries;
}

function relativePathOf(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}
