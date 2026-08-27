import { toUploadFiles, type UploadFile } from './upload-file';

export function transferHasFiles(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  return Array.from(transfer.types).includes('Files');
}

export async function readDroppedUploadFiles(transfer: DataTransfer): Promise<UploadFile[]> {
  const entries = Array.from(transfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length === 0) return toUploadFiles(transfer.files);

  const collected: UploadFile[] = [];
  for (const entry of entries) await collectEntry(entry, '', collected);
  return collected;
}

async function collectEntry(entry: FileSystemEntry, prefix: string, into: UploadFile[]): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    if (file) into.push({ file, path });
    return;
  }
  if (!entry.isDirectory) return;

  for (const child of await readDirectoryEntries(entry as FileSystemDirectoryEntry)) {
    await collectEntry(child, path, into);
  }
}

function readEntryFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null)
    );
  });
}

async function readDirectoryEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const entries: FileSystemEntry[] = [];

  while (true) {
    const batch = await readEntryBatch(reader);
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

function readEntryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    reader.readEntries(
      (batch) => resolve(batch),
      () => resolve([])
    );
  });
}
