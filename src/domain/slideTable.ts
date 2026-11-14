/** A small table written in a slide's text: rows of cells between upright bars, all rows as wide as the widest. */
export interface SlideTable {
  header: string[] | null;
  rows: string[][];
}

const BAR = '|';
const DASH_CELL = /^:?-+:?$/;

/** A row line, trimmed, starts and ends with a bar and holds more than that one bar. */
export function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 1 && trimmed.startsWith(BAR) && trimmed.endsWith(BAR);
}

const cellsOf = (line: string): string[] =>
  line
    .trim()
    .slice(1, -1)
    .split(BAR)
    .map((cell) => cell.trim());

/** A row of dashes (with an optional colon at an end of a cell), as chat assistants write under a header: never drawn. */
const isDashRow = (cells: readonly string[]): boolean => cells.every((cell) => DASH_CELL.test(cell));

/** A table that starts with this row line, or nothing when the line is a row of dashes. */
export function startTable(line: string): SlideTable | null {
  const table: SlideTable = { header: null, rows: [] };
  addTableRow(table, line);
  return table.rows.length > 0 ? table : null;
}

/** Adds a row line to the table: a row of dashes right after the first row makes that row the header, and anywhere else it is dropped. */
export function addTableRow(table: SlideTable, line: string): void {
  const cells = cellsOf(line);
  if (isDashRow(cells)) {
    if (table.header === null && table.rows.length === 1) table.header = table.rows.shift() ?? null;
    return;
  }
  table.rows.push(cells);
  const width = Math.max(table.header?.length ?? 0, ...table.rows.map((row) => row.length));
  for (const row of table.header ? [table.header, ...table.rows] : table.rows) while (row.length < width) row.push('');
}

/** A starter table as text: a header row, the row of dashes under it, and one empty row, each as wide as `headers`; `caret` is where its first header cell begins. */
export function starterTable(headers: readonly string[]): { text: string; caret: number } {
  const row = (cells: readonly string[]) => `${BAR} ${cells.join(` ${BAR} `)} ${BAR}`;
  const text = [row(headers), row(headers.map(() => '---')), row(headers.map(() => ''))].join('\n');
  return { text, caret: `${BAR} `.length };
}
