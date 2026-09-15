import { t } from '~/i18n';
import { Match, Switch, createEffect, createMemo, createSignal, on } from 'solid-js';
import type { Range, WorkBook, WorkSheet } from 'xlsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { FileDownloadCard } from './file-download-card';
import { createFileFetch, type FileFetchState } from './file-fetch';
import { FilePreviewNotice } from './file-preview-notice';
import { FileValuesGrid, valuesGridNote } from './file-values-grid';
import { MAX_TABLE_PREVIEW_COLUMNS, MAX_TABLE_PREVIEW_ROWS, MAX_WORKBOOK_PREVIEW_BYTES } from './file-preview-limits';

type XlsxModule = typeof import('xlsx');

type CellValue = string | number | boolean;

interface LoadedWorkbook {
  kind: 'workbook';
  xlsx: XlsxModule;
  book: WorkBook;
  sheetNames: string[];
}

type WorkbookLoad = LoadedWorkbook | { kind: 'too-large' } | { kind: 'unreadable' };

interface SheetGrid {
  rows: string[][];
  note: string | undefined;
}

export interface FileXlsxPreviewProps {
  url: string;
  name: string;
  onDownload: () => void;
}

export function FileXlsxPreview(props: FileXlsxPreviewProps) {
  const state = createFileFetch(() => props.url, readWorkbook);
  const [sheetName, setSheetName] = createSignal<string | null>(null);

  const workbook = () => loadedWorkbook(state());

  createEffect(on(workbook, (loaded) => setSheetName(loaded?.sheetNames[0] ?? null)));

  const grid = createMemo(() => {
    const loaded = workbook();
    const name = sheetName();
    if (!loaded || name === null) return null;
    return sheetGrid(loaded, name);
  });

  const sheetSelector = () => {
    const loaded = workbook();
    if (!loaded || loaded.sheetNames.length < 2) return undefined;
    return (
      <>
        <span class="text-xs text-muted-foreground shrink-0">{t("Sheet")}</span>
        <Select
          options={loaded.sheetNames}
          value={sheetName()}
          onChange={(name) => {
            if (name !== null) setSheetName(name);
          }}
          itemComponent={(itemProps) => <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>}
        >
          <SelectTrigger class="w-48">
            <SelectValue<string>>{(value) => <span class="truncate">{value.selectedOption()}</span>}</SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>
      </>
    );
  };

  return (
    <Switch>
      <Match when={state().status === 'loading'}>
        <FilePreviewNotice title={t("Loading workbook…")} loading />
      </Match>
      <Match when={state().status === 'missing'}>
        <FilePreviewNotice title={t("File not found")} detail={t("It may have been renamed, moved, or deleted.")} />
      </Match>
      <Match when={state().status === 'error'}>
        <FilePreviewNotice title={t("Could not load this file")} detail={t("Try again, or download it instead.")} />
      </Match>
      <Match when={loadKindOf(state()) === 'too-large'}>
        <FileDownloadCard
          name={props.name}
          detail={t("This workbook is too large to preview here.")}
          onDownload={props.onDownload}
        />
      </Match>
      <Match when={loadKindOf(state()) === 'unreadable'}>
        <FileDownloadCard
          name={props.name}
          detail={t("This workbook could not be read, so it cannot be shown here.")}
          onDownload={props.onDownload}
        />
      </Match>
      <Match when={grid()}>
        {(sheet) => (
          <FileValuesGrid
            rows={sheet().rows}
            note={sheet().note}
            emptyTitle={t("This sheet is empty")}
            toolbar={sheetSelector()}
          />
        )}
      </Match>
    </Switch>
  );
}

function loadKindOf(state: FileFetchState<WorkbookLoad>): WorkbookLoad['kind'] | null {
  return state.status === 'ready' ? state.value.kind : null;
}

function loadedWorkbook(state: FileFetchState<WorkbookLoad>): LoadedWorkbook | null {
  if (state.status !== 'ready' || state.value.kind !== 'workbook') return null;
  return state.value;
}

async function readWorkbook(response: Response): Promise<WorkbookLoad> {
  if (declaredSize(response) > MAX_WORKBOOK_PREVIEW_BYTES) {
    await response.body?.cancel().catch(() => {});
    return { kind: 'too-large' };
  }

  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength > MAX_WORKBOOK_PREVIEW_BYTES) return { kind: 'too-large' };

  const xlsx = await import('xlsx');
  try {
    const book = xlsx.read(data, { type: 'array' });
    return { kind: 'workbook', xlsx, book, sheetNames: book.SheetNames };
  } catch {
    return { kind: 'unreadable' };
  }
}

function declaredSize(response: Response): number {
  const header = response.headers.get('Content-Length');
  if (header === null) return 0;
  const size = Number(header);
  return Number.isFinite(size) ? size : 0;
}

function sheetGrid(loaded: LoadedWorkbook, name: string): SheetGrid | null {
  const sheet = loaded.book.Sheets[name];
  if (!sheet) return null;

  const full = sheetRange(loaded.xlsx, sheet);
  if (!full) return { rows: [], note: undefined };

  const range: Range = {
    s: { r: full.s.r, c: full.s.c },
    e: {
      r: Math.min(full.e.r, full.s.r + MAX_TABLE_PREVIEW_ROWS - 1),
      c: Math.min(full.e.c, full.s.c + MAX_TABLE_PREVIEW_COLUMNS - 1),
    },
  };
  const rows = loaded.xlsx.utils.sheet_to_json<CellValue[]>(sheet, { header: 1, raw: false, defval: '', range });

  return {
    rows: rows.map((row) => row.map(cellText)),
    note: valuesGridNote({ rows: range.e.r < full.e.r, columns: range.e.c < full.e.c }),
  };
}

function sheetRange(xlsx: XlsxModule, sheet: WorkSheet): Range | null {
  const ref = sheet['!ref'];
  return typeof ref === 'string' ? xlsx.utils.decode_range(ref) : null;
}

function cellText(value: CellValue): string {
  return typeof value === 'string' ? value : String(value);
}
