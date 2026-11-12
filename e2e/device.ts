import type { Browser, Page } from 'puppeteer';

export interface Viewport {
  width: number;
  height: number;
}

export const DESKTOP: Viewport = { width: 1360, height: 850 };
export const PHONE: Viewport = { width: 390, height: 780 };

const POLL_MS = 50;
const DEFAULT_WAIT_MS = 6000;
const PAGE_SNIPPET = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One browser tab acting as one device. Every wait polls and throws a message that names what never happened. */
export class Device {
  private constructor(
    readonly page: Page,
    private readonly name: string,
  ) {}

  static async open(browser: Browser, name: string, url: string, viewport: Viewport, errors: string[]): Promise<Device> {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    page.on('pageerror', (error) => errors.push(`${name}: ${String(error)}`));
    await page.goto(url, { waitUntil: 'networkidle0' });
    return new Device(page, name);
  }

  text(): Promise<string> {
    return this.page.evaluate(() => document.body.innerText);
  }

  async has(needle: string): Promise<boolean> {
    return (await this.text()).includes(needle);
  }

  private async fail(what: string): Promise<never> {
    const shown = (await this.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, PAGE_SNIPPET);
    throw new Error(`${this.name} never reached: ${what}. Its address is ${this.page.url()} and it shows: ${shown}`);
  }

  async until(what: string, probe: () => Promise<boolean>, timeoutMs = DEFAULT_WAIT_MS): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await probe()) return;
      await sleep(POLL_MS);
    }
    await this.fail(what);
  }

  /** For "nothing happens" checks: the probe must stay true for the whole window. */
  async holds(what: string, probe: () => Promise<boolean>, windowMs = 800): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < windowMs) {
      if (!(await probe())) await this.fail(`${what} (it changed)`);
      await sleep(POLL_MS);
    }
  }

  waitFor(needle: string, timeoutMs?: number): Promise<void> {
    return this.until(`the text "${needle}"`, () => this.has(needle), timeoutMs);
  }

  waitGone(needle: string, timeoutMs?: number): Promise<void> {
    return this.until(`the text "${needle}" to disappear`, async () => !(await this.has(needle)), timeoutMs);
  }

  exists(selector: string): Promise<boolean> {
    return this.page.$(selector).then((found) => found !== null);
  }

  count(selector: string): Promise<number> {
    return this.page.$$(selector).then((found) => found.length);
  }

  texts(selector: string): Promise<string[]> {
    return this.page.$$eval(selector, (elements) => elements.map((element) => (element as HTMLElement).innerText));
  }

  /** Clicks the first enabled button, link or summary inside `scope` whose text contains `label`. */
  async click(label: string, scope = 'body'): Promise<void> {
    const attempt = () =>
      this.page.evaluate(
        (wanted, scopeSelector) => {
          const root = document.querySelector(scopeSelector) ?? document.body;
          const target = [...root.querySelectorAll<HTMLElement>('button, a, summary')].find(
            (element) => element.innerText.trim().includes(wanted) && !(element as HTMLButtonElement).disabled,
          );
          target?.click();
          return target !== undefined;
        },
        label,
        scope,
      );
    await this.until(`a button "${label}" inside ${scope}`, attempt);
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.waitForSelector(selector);
    await this.page.$eval(selector, (element) => {
      (element as HTMLInputElement).focus();
      (element as HTMLInputElement).select();
    });
    await this.page.keyboard.press('Backspace');
    if (value) await this.page.type(selector, value);
  }

  /** Sets a textarea the way a paste does, in one step. */
  paste(selector: string, value: string): Promise<void> {
    return this.page.$eval(
      selector,
      (element, text) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(element, text);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      },
      value,
    );
  }

  async goto(hash: string): Promise<void> {
    await this.page.goto(new URL(hash, this.page.url()).href);
  }
}
