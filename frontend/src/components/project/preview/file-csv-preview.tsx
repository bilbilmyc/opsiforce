import { Match, Switch } from 'solid-js';
import { FileDownloadCard } from './file-download-card';
import { createFileFetch, type FileFetchState } from './file-fetch';
import { FilePreviewNotice } from './file-preview-notice';
import { FileValuesGrid, valuesGridNote } from './file-values-grid';
import {
  MAX_TABLE_PREVIEW_BYTES,
  MAX_TABLE_PREVIEW_COLUMNS,
  MAX_TABLE_PREVIEW_ROWS,
  SNIFF_BYTE_COUNT,
} from './file-preview-limits';
import { parseDelimited } from './parse-delimited';

interface CsvTable {
  rows: string[][];
  note: string | undefined;
}

export interface FileCsvPreviewProps {
  url: string;
  name: string;
  onDownload: () => void;
}

export function FileCsvPreview(props: FileCsvPreviewProps) {
  const state = createFileFetch(() => props.url, readTable);

  return (
    <Switch>
      <Match when={state().status === 'loading'}>
        <FilePreviewNotice title="Loading preview…" loading />
      </Match>
      <Match when={state().status === 'missing'}>
        <FilePreviewNotice title="File not found" detail="It may have been renamed, moved, or deleted." />
      </Match>
      <Match when={state().status === 'error'}>
        <FilePreviewNotice title="Could not load this file" detail="Try again, or download it instead." />
      </Match>
      <Match when={loadedTable(state())}>
        {(loaded) => <FileValuesGrid rows={loaded().rows} note={loaded().note} emptyTitle="This file has no rows" />}
      </Match>
      <Match when={state().status === 'ready'}>
        <FileDownloadCard
          name={props.name}
          detail="This file is not text, so it cannot be shown here."
          onDownload={props.onDownload}
        />
      </Match>
    </Switch>
  );
}

function loadedTable(state: FileFetchState<CsvTable | null>): CsvTable | null {
  return state.status === 'ready' ? state.value : null;
}

async function readTable(response: Response): Promise<CsvTable | null> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.subarray(0, SNIFF_BYTE_COUNT).includes(0)) return null;

  const truncatedBytes = bytes.byteLength > MAX_TABLE_PREVIEW_BYTES;
  const text = new TextDecoder().decode(truncatedBytes ? bytes.subarray(0, MAX_TABLE_PREVIEW_BYTES) : bytes);

  const parsed = parseDelimited(text, ',', MAX_TABLE_PREVIEW_ROWS);
  const truncatedColumns = parsed.rows.some((row) => row.length > MAX_TABLE_PREVIEW_COLUMNS);
  const rows = truncatedColumns ? parsed.rows.map((row) => row.slice(0, MAX_TABLE_PREVIEW_COLUMNS)) : parsed.rows;

  return {
    rows,
    note: valuesGridNote({ rows: parsed.truncatedRows, columns: truncatedColumns, bytes: truncatedBytes }),
  };
}
