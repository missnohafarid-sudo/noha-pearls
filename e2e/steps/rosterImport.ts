import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import type { RosterEntry, World } from '../world';
import { storedRecords } from '../world';

const tr = t.roster.import;
const PASTE_AREA = `textarea[aria-label="${tr.pasteLabel}"]`;
const NEW_GROUP = 'Walkthrough Group';
const NEW_STUDENTS = [
  { cardNumber: 901, written: '901', name: 'Test Alpha' },
  { cardNumber: 902, written: '٩٠٢', name: 'Test Beta' },
  { cardNumber: 903, written: '903', name: 'Test Gamma' },
];
const NEW_LIST = NEW_STUDENTS.map((s) => [s.written, s.name, NEW_GROUP].join('\t')).join('\n');
const DUPLICATE_LIST = '904\tTest Delta\tOther Group\n904\tTest Echo\tOther Group';

interface StoredGroup {
  id: string;
  name: string;
}

/** Bringing a class in by pasting its list, and a list with a mistake changing nothing. */
export function rosterImportSteps(world: World): void {
  const students = () => storedRecords<RosterEntry>(world.admin, 'students');

  it('a pasted class list adds its students under a new group and keeps the others', async () => {
    await world.admin.goto('#/roster');
    await world.admin.waitFor(world.roster[0].name);
    await world.admin.until('the class list box', () => world.admin.exists(PASTE_AREA));
    await world.admin.paste(PASTE_AREA, NEW_LIST);
    await world.admin.click(tr.addButton);
    for (const student of NEW_STUDENTS) await world.admin.waitFor(student.name);

    const group = (await storedRecords<StoredGroup>(world.admin, 'groups')).find((g) => g.name === NEW_GROUP);
    expect(group).toBeDefined();
    const stored = await students();
    for (const student of NEW_STUDENTS) {
      expect(stored.find((s) => s.cardNumber === student.cardNumber)).toMatchObject({ name: student.name, groupId: group!.id });
    }
    for (const earlier of world.roster) expect(stored).toContainEqual(expect.objectContaining(earlier));
  });

  it('a list with a repeated card number shows the line and changes nothing', async () => {
    const before = (await students()).length;
    await world.admin.paste(PASTE_AREA, DUPLICATE_LIST);
    await world.admin.click(tr.addButton);
    await world.admin.waitFor(t.roster.describeIssue({ code: 'duplicate-card-number', line: 2 }));
    expect(await students()).toHaveLength(before);
  });
}
