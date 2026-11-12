import { MAX_CARD_NUMBER, MIN_CARD_NUMBER } from './cards';
import { toAsciiDigits } from './digits';
import { newId } from './ids';
import type { Group, Id, Student } from './models';
import { sortByOrder } from './lists';
import { createGroup, groupById } from './roster';

/**
 * The class list: the one text format in which a class enters and leaves the platform.
 * One student per line: card number, name, group. Cells are separated by a tab (what
 * Excel copies) or, on a line without a tab, by a comma, an Arabic comma, a semicolon or a vertical bar. Blank lines and lines
 * starting with # are ignored, and so is a first line whose card-number cell has no digit.
 */

const TAB = '\t';
const OTHER_SEPARATORS = /[,\u060C;|]/;
const COMMENT_MARK = '#';
const CELL_COUNT = 3;

export type RosterIssueCode =
  | 'wrong-cell-count'
  | 'bad-card-number'
  | 'duplicate-card-number'
  | 'empty-name'
  | 'empty-group'
  | 'no-students';

export interface RosterIssue {
  code: RosterIssueCode;
  /** 1-based line of the pasted text, or null when the problem is the whole text. */
  line: number | null;
}

export interface RosterEntry {
  cardNumber: number;
  name: string;
  groupName: string;
}

export type RosterParseResult = { ok: true; entries: RosterEntry[] } | { ok: false; issues: RosterIssue[] };

const cellsOf = (line: string): string[] =>
  (line.includes(TAB) ? line.split(TAB) : line.split(OTHER_SEPARATORS)).map((cell) => cell.trim());

function cardNumberOf(cell: string): number | null {
  const digits = toAsciiDigits(cell);
  if (!/^\d+$/.test(digits)) return null;
  const number = Number(digits);
  return number >= MIN_CARD_NUMBER && number <= MAX_CARD_NUMBER ? number : null;
}

export function parseRosterText(text: string): RosterParseResult {
  const entries: RosterEntry[] = [];
  const issues: RosterIssue[] = [];
  const seen = new Set<number>();
  let sawFirstDataLine = false;

  text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\r|\n/)
    .forEach((raw, index) => {
      const line = index + 1;
      const trimmed = raw.trim();
      if (trimmed === '' || trimmed.startsWith(COMMENT_MARK)) return;
      const isFirstDataLine = !sawFirstDataLine;
      sawFirstDataLine = true;

      const cells = cellsOf(raw);
      if (isFirstDataLine && cells[0] !== '' && !/\d/.test(toAsciiDigits(cells[0]))) return;
      if (cells.length !== CELL_COUNT) {
        issues.push({ code: 'wrong-cell-count', line });
        return;
      }
      const [numberCell, name, groupName] = cells;
      const cardNumber = cardNumberOf(numberCell);
      if (cardNumber === null) issues.push({ code: 'bad-card-number', line });
      else if (seen.has(cardNumber)) issues.push({ code: 'duplicate-card-number', line });
      else seen.add(cardNumber);
      if (name === '') issues.push({ code: 'empty-name', line });
      if (groupName === '') issues.push({ code: 'empty-group', line });
      if (cardNumber !== null && name !== '' && groupName !== '') entries.push({ cardNumber, name, groupName });
    });

  if (issues.length > 0) return { ok: false, issues };
  if (entries.length === 0) return { ok: false, issues: [{ code: 'no-students', line: null }] };
  return { ok: true, entries };
}

/** `header` is the comment line naming the columns; the caller supplies its words. */
export function exportRosterText(groups: readonly Group[], students: readonly Student[], header: string): string {
  const groupName = (student: Student) => groupById(groups, student.groupId)?.name ?? '';
  const lines = [...students]
    .sort((a, b) => a.cardNumber - b.cardNumber)
    .map((student) => [student.cardNumber, student.name, groupName(student)].join(TAB));
  return [`${COMMENT_MARK} ${header}`, ...lines].join('\n') + '\n';
}

export type ImportMode = 'merge' | 'replace';

export interface RosterChanges {
  studentsAdded: number;
  studentsUpdated: number;
  studentsRemoved: number;
  groupsAdded: number;
  groupsRemoved: number;
}

export interface RosterApplied {
  groups: Group[];
  students: Student[];
  changes: RosterChanges;
}

/** `groups` and `students` are those of the class `classId`; the result is the class's new list. */
export function applyRoster(
  entries: readonly RosterEntry[],
  classId: Id,
  groups: readonly Group[],
  students: readonly Student[],
  mode: ImportMode,
): RosterApplied {
  const allGroups = [...groups];
  const groupFor = (name: string): Group => {
    let group = allGroups.find((existing) => existing.name === name);
    if (!group) {
      group = createGroup(name, classId, allGroups);
      allGroups.push(group);
    }
    return group;
  };

  const byCard = new Map(students.map((student) => [student.cardNumber, student]));
  const fileCards = new Set(entries.map((entry) => entry.cardNumber));
  let studentsAdded = 0;
  let studentsUpdated = 0;
  const written = new Map<number, Student>();
  for (const entry of entries) {
    const groupId = groupFor(entry.groupName).id;
    const found = byCard.get(entry.cardNumber);
    if (!found) {
      studentsAdded += 1;
      written.set(entry.cardNumber, { id: newId(), cardNumber: entry.cardNumber, name: entry.name, groupId });
    } else {
      if (found.name !== entry.name || found.groupId !== groupId) studentsUpdated += 1;
      written.set(entry.cardNumber, { ...found, name: entry.name, groupId });
    }
  }

  const kept = students.filter((student) => mode === 'merge' || fileCards.has(student.cardNumber));
  const resultStudents = [...kept.map((student) => written.get(student.cardNumber) ?? student), ...[...written.values()].filter((s) => !byCard.has(s.cardNumber))];
  const used = new Set(resultStudents.map((student) => student.groupId));
  const resultGroups = sortByOrder(mode === 'merge' ? allGroups : allGroups.filter((group) => used.has(group.id)));

  return {
    groups: resultGroups,
    students: resultStudents,
    changes: {
      studentsAdded,
      studentsUpdated,
      studentsRemoved: students.length - kept.length,
      groupsAdded: allGroups.length - groups.length,
      groupsRemoved: allGroups.length - resultGroups.length,
    },
  };
}
