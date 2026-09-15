import type { FilesListing, FilesSectionKey } from '~/api/files';

export const FILES_SECTION_ORDER: FilesSectionKey[] = ['other', 'generated', 'uploads'];

export function defaultFileSection(listing?: FilesListing): FilesSectionKey {
  if (listing?.kind !== 'root') return 'other';
  return FILES_SECTION_ORDER.find(key => listing.sections.some(section => section.key === key && section.entries.length > 0)) ?? 'other';
}
