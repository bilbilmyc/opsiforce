export interface DelimitedTable {
  rows: string[][];
  truncatedRows: boolean;
}

export function parseDelimited(text: string, delimiter: string, maxRows: number): DelimitedTable {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  const endRow = () => {
    row.push(field);
    rows.push(row);
    field = '';
    row = [];
  };

  while (index < source.length) {
    const char = source[index];

    if (quoted) {
      if (char !== '"') {
        field += char;
        index += 1;
      } else if (source[index + 1] === '"') {
        field += '"';
        index += 2;
      } else {
        quoted = false;
        index += 1;
      }
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      endRow();
      index += char === '\r' && source[index + 1] === '\n' ? 2 : 1;
      if (rows.length >= maxRows) return { rows, truncatedRows: hasContentFrom(source, index) };
      continue;
    }

    field += char;
    index += 1;
  }

  if (field !== '' || row.length > 0) endRow();
  return { rows, truncatedRows: false };
}

function hasContentFrom(source: string, index: number): boolean {
  for (let cursor = index; cursor < source.length; cursor += 1) {
    if (!/\s/.test(source[cursor])) return true;
  }
  return false;
}
