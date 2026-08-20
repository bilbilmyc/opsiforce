const KIB = 1024;
const MIB = KIB * 1024;
const GIB = MIB * 1024;
const TIB = GIB * 1024;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < KIB) return `${bytes} B`;
  if (bytes < MIB) return `${Math.round(bytes / KIB)} KiB`;
  if (bytes < GIB) return `${Math.round(bytes / MIB)} MiB`;
  if (bytes < TIB) return `${(bytes / GIB).toFixed(1)} GiB`;
  return `${(bytes / TIB).toFixed(2)} TiB`;
}

export function formatShare(bytes: number, baseBytes: number): string {
  if (baseBytes <= 0) return '—';
  return `${((bytes / baseBytes) * 100).toFixed(1)}%`;
}
