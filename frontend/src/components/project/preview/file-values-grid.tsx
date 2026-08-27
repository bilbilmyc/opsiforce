import { For, Show, type JSX } from 'solid-js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { FilePreviewNotice } from './file-preview-notice';
import { MAX_TABLE_PREVIEW_COLUMNS, MAX_TABLE_PREVIEW_ROWS } from './file-preview-limits';

export interface FileValuesGridProps {
  rows: string[][];
  emptyTitle: string;
  toolbar?: JSX.Element;
  note?: string;
}

export function FileValuesGrid(props: FileValuesGridProps) {
  const header = () => props.rows[0] ?? [];
  const body = () => props.rows.slice(1);

  return (
    <div class="h-full flex flex-col min-h-0">
      <Show when={props.toolbar}>
        <div class="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-border">{props.toolbar}</div>
      </Show>

      <Show
        when={props.rows.length > 0}
        fallback={<FilePreviewNotice title={props.emptyTitle} detail="There is nothing to show here." />}
      >
        <div class="flex-1 min-h-0 overflow-auto">
          <Table class="text-xs">
            <TableHeader class="sticky top-0 z-10 bg-muted">
              <TableRow>
                <For each={header()}>{(cell) => <TableHead class="whitespace-nowrap">{cell}</TableHead>}</For>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={body()}>
                {(row) => (
                  <TableRow>
                    <For each={paddedRow(row, header().length)}>
                      {(cell) => <TableCell class="py-1.5 whitespace-nowrap tabular-nums">{cell}</TableCell>}
                    </For>
                  </TableRow>
                )}
              </For>
            </TableBody>
          </Table>
        </div>
      </Show>

      <Show when={props.note}>
        <p class="shrink-0 px-2 py-1.5 border-t border-border text-xs text-muted-foreground">{props.note}</p>
      </Show>
    </div>
  );
}

export function valuesGridNote(truncated: { rows: boolean; columns: boolean; bytes?: boolean }): string | undefined {
  const limits: string[] = [];
  if (truncated.rows) limits.push(`the first ${MAX_TABLE_PREVIEW_ROWS} rows`);
  if (truncated.columns) limits.push(`the first ${MAX_TABLE_PREVIEW_COLUMNS} columns`);
  if (truncated.bytes) limits.push('only part of the file');
  if (limits.length === 0) return undefined;
  return `Showing ${limits.join(' and ')} — download the file to see all of it.`;
}

function paddedRow(row: string[], width: number): string[] {
  if (row.length >= width) return row;
  return [...row, ...Array<string>(width - row.length).fill('')];
}
