export function FilesDropOverlay(props: { label: string }) {
  return (
    <div class="absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5 text-sm text-primary pointer-events-none">
      {props.label}
    </div>
  );
}
