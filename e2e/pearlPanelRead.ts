import { t } from '../src/i18n';
import type { Device } from './device';

export type Mark = 'answered' | 'waiting' | null;

export interface PanelStudent {
  name: string;
  absent: boolean;
  mark: Mark;
}

export interface PanelGroup {
  name: string;
  /** What the group's card on «الكل» says of a group question; null on an individual one. */
  mark: Mark;
  /** The names the card on «الكل» lists as not having answered yet. */
  waiting: string[];
  /** All the students its own tab lists, in the order shown. */
  students: PanelStudent[];
}

const TABS = '.pearl-panel .pearl-tab';

/** The name on the tab that is shown now: the group's, or the word of «الكل». */
export const shownTab = (device: Device): Promise<string> =>
  device.page.$eval(`${TABS}[aria-selected="true"]`, (tab) => (tab as HTMLElement).innerText.trim());

/** Shows the tab with this text (a group's name, or the word of «الكل») with a plain click, and waits until its page is there. */
export async function showTab(device: Device, name: string): Promise<void> {
  await device.until(`the tab ${name}`, () => device.page.evaluate((selector, wanted) => [...document.querySelectorAll<HTMLElement>(selector)].some((tab) => tab.innerText.trim() === wanted), TABS, name));
  if ((await shownTab(device)) !== name) {
    await device.page.evaluate((selector, wanted) => [...document.querySelectorAll<HTMLElement>(selector)].find((tab) => tab.innerText.trim() === wanted)?.click(), TABS, name);
  }
  const overview = name === t.pearlPanel.all;
  await device.until(`the page of ${name}`, () =>
    device.page.evaluate(
      (all, wanted) => (all ? document.querySelector('.pearl-overview') !== null : document.querySelector(`.pearl-group[aria-label="${wanted}"]`) !== null),
      overview,
      name,
    ),
  );
}

/** The names of the students «الكل» lists as not having answered, group by group in the order shown. */
export const waitingNamesShown = async (device: Device): Promise<string[]> => {
  await showTab(device, t.pearlPanel.all);
  return device.page.evaluate(() => [...document.querySelectorAll('.pearl-overview .pearl-waiting-name')].map((chip) => chip.textContent ?? ''));
};

/** The students one group's tab lists. */
async function studentsOfTab(device: Device, group: string): Promise<PanelStudent[]> {
  await showTab(device, group);
  return device.page.evaluate(() =>
    [...document.querySelectorAll('.pearl-group .pearl-student')].map((row) => ({
      name: row.querySelector('.pearl-student__name')?.textContent ?? '',
      absent: row.classList.contains('pearl-student--absent'),
      mark: row.querySelector('.pearl-mark--answered') ? ('answered' as const) : row.querySelector('.pearl-mark--waiting') ? ('waiting' as const) : null,
    })),
  );
}

/** Everything the open panel shows of every group: its card on «الكل», then each group's tab; the tab that was shown is shown again at the end. */
export async function readPearlPanel(device: Device): Promise<PanelGroup[]> {
  const before = await shownTab(device);
  await showTab(device, t.pearlPanel.all);
  const cards = await device.page.evaluate(() =>
    [...document.querySelectorAll('.pearl-overview .pearl-card')].map((card) => ({
      name: card.querySelector('.pearl-card__open')?.textContent ?? '',
      answered: card.querySelector('.pearl-card__pearls .pearl-mark--answered') !== null,
      waitingMark: card.querySelector('.pearl-card__pearls .pearl-mark--waiting') !== null,
      waiting: [...card.querySelectorAll('.pearl-waiting-name')].map((chip) => chip.textContent ?? ''),
    })),
  );
  const groups: PanelGroup[] = [];
  for (const card of cards) {
    const students = await studentsOfTab(device, card.name);
    groups.push({ name: card.name, mark: card.answered ? 'answered' : card.waitingMark ? 'waiting' : null, waiting: card.waiting, students });
  }
  await showTab(device, before);
  return groups;
}
