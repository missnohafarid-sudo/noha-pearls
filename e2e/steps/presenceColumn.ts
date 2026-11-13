import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { setPresentOnMonitor } from '../actions';
import type { World } from '../world';

interface Table {
  headers: string[];
  rows: { cells: { text: string; toggles: number }[] }[];
}

/** The presence column of the monitor's group tables: its header, where each toggle sits, and that pressing it marks a student absent and present again. */
export function presenceColumnSteps(world: World): void {
  const student = () => world.roster[0];

  const tables = (): Promise<Table[]> =>
    world.admin.page.evaluate(() =>
      [...document.querySelectorAll('table')]
        .filter((table) => table.querySelector('tbody tr'))
        .map((table) => ({
          headers: [...table.querySelectorAll('thead th')].map((head) => (head as HTMLElement).innerText.trim()),
          rows: [...table.querySelectorAll('tbody tr')].map((row) => ({
            cells: [...row.querySelectorAll('td')].map((cell) => ({ text: cell.innerText.trim(), toggles: cell.querySelectorAll('button.status__toggle').length })),
          })),
        })),
    );
  const herCells = async () => (await tables()).flatMap((table) => table.rows).find((row) => row.cells.some((cell) => cell.text === student().name))!.cells;

  it('the monitor table has a presence column right after the student column, and each row\'s toggle is in it and not in the name cell', async () => {
    await world.admin.goto('#/monitor');
    await world.admin.waitFor(t.monitor.minInteractions);
    const shown = await tables();
    expect(shown.length).toBeGreaterThan(0);
    for (const table of shown) {
      const name = table.headers.indexOf(t.monitor.student);
      expect(name).toBeGreaterThanOrEqual(0);
      expect(table.headers[name + 1]).toBe(t.monitor.presence);
      for (const row of table.rows) {
        expect(row.cells[name].toggles).toBe(0);
        expect(row.cells[name + 1].toggles).toBe(1);
        expect(row.cells.filter((cell) => cell.toggles > 0)).toHaveLength(1);
      }
    }
  });

  it('pressing the toggle in the presence column marks her absent there, and pressing it again puts her back', async () => {
    const [{ headers }] = await tables();
    const column = headers.indexOf(t.monitor.presence);
    const was = (await herCells())[column].text;
    expect([t.common.present, t.common.absent]).toContain(was);
    const wasPresent = was === t.common.present;
    await setPresentOnMonitor(world.admin, student().name, !wasPresent);
    await world.admin.until('the other word in her presence cell', async () => (await herCells())[column].text !== was);
    expect((await herCells())[1].text).toBe(student().name);
    await setPresentOnMonitor(world.admin, student().name, wasPresent);
    await world.admin.until('her presence cell as it was', async () => (await herCells())[column].text === was);
  });
}
