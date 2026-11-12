import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { Device } from '../device';
import { SAMPLE } from '../sample';
import { WRONG_PASSWORD, rightCode, rightPassword, wrongCode } from '../testAdmin';
import { expectRefused, isAdminMode, openSignIn, signInAsAdmin, submitLogin, type World } from '../world';

const PHONE_SIZE = { width: 390, height: 800 };
const PASSWORD_FIELD = 'dialog[open] input[type=password]';
const CODE_FIELD = 'dialog[open] input[inputmode=numeric]';

/** The visitor's view of the site, then the two-factor sign-in behind its button. */
export function signInSteps(world: World): void {
  it('home renders for a visitor', async () => {
    await world.admin.waitFor(SAMPLE.title);
  });

  it('a visitor sees no admin navigation and no edit panel', async () => {
    expect(await world.admin.has(t.shell.nav.session)).toBe(false);
    expect(await isAdminMode(world.admin)).toBe(false);
    expect(await world.admin.exists('.shell__panel')).toBe(false);
  });

  it('there is no password field until the sign-in button is pressed', async () => {
    expect(await world.admin.exists(PASSWORD_FIELD)).toBe(false);
  });

  it('the sign-in button opens the password and code fields', async () => {
    await openSignIn(world.admin);
    expect(await world.admin.exists(CODE_FIELD)).toBe(true);
  });

  it('on a phone the sign-in button is visible and opens the prompt', async () => {
    const phone = await Device.open(world.browser, 'phone', world.baseUrl, PHONE_SIZE, world.errors);
    const visible = await phone.page.$$eval('.shell__bar button', (buttons, label) => {
      const target = buttons.find((button) => button.textContent?.includes(label));
      const box = target?.getBoundingClientRect();
      return box !== undefined && box.width > 0 && box.left >= 0 && box.right <= window.innerWidth;
    }, t.shell.signIn);
    expect(visible).toBe(true);
    await openSignIn(phone);
    await phone.page.close();
  });

  it('a wrong password with a right code is refused', async () => {
    await submitLogin(world.admin, WRONG_PASSWORD, await rightCode());
    await expectRefused(world.admin);
  });

  it('a right password with a wrong code is refused', async () => {
    await submitLogin(world.admin, rightPassword(), await wrongCode());
    await expectRefused(world.admin);
  });

  it('the right password and code enter admin mode', async () => {
    await signInAsAdmin(world.admin);
    expect(await world.admin.exists('.shell__panel')).toBe(true);
  });
}
