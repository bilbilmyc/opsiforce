export type FileEntryType = 'file' | 'directory';

export interface FileEntry {
  name: string;
  path: string;
  type: FileEntryType;
  size: number;
  modifiedAt: string;
  canDelete: boolean;
}

export type FilesSectionKey = 'uploads' | 'generated' | 'other';

export interface FilesSection {
  key: FilesSectionKey;
  path: string;
  entries: FileEntry[];
}

export interface FilesRootListing {
  kind: 'root';
  path: string;
  sections: FilesSection[];
}

export interface FilesDirectoryListing {
  kind: 'directory';
  path: string;
  entries: FileEntry[];
}

export type FilesListing = FilesRootListing | FilesDirectoryListing;
