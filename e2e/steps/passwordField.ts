import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { WRONG_PASSWORD, rightCode } from '../testAdmin';
import { expectRefused, isAdminMode, openSignIn, type World } from '../world';

const PASSWORD_FIELD = 'dialog[open] input.password-field__input';
const TOGGLE = 'dialog[open] .password-field__toggle';
const TYPED = 'typed-in-the-walkthrough';
const CARET = 3;
/** Pixels the field may differ by and still count as unmoved: the browser rounds its layout to fractions of a pixel. */
const SAME_PLACE = 0.5;

const fieldType = (world: World) => world.admin.page.$eval(PASSWORD_FIELD, (field) => (field as HTMLInputElement).type);
const toggleName = (world: World) => world.admin.page.$eval(TOGGLE, (button) => button.getAttribute('aria-label'));
const fieldTop = (world: World) => world.admin.page.$eval(PASSWORD_FIELD, (field) => field.getBoundingClientRect().top);

/** The sign-in prompt's own show and hide button for the password. The teacher is signed out before and after. */
export function passwordFieldSteps(world: World): void {
  it('the eye button is in the password field before anything is typed, and says it shows the password', async () => {
    await openSignIn(world.admin);
    expect(await world.admin.exists(TOGGLE)).toBe(true);
    expect(await toggleName(world)).toBe(t.common.showPassword);
    expect(await fieldType(world)).toBe('password');
  });

  it('pressing it shows what was typed, keeps the caret in the field, and pressing again hides it', async () => {
    await world.admin.fill(PASSWORD_FIELD, TYPED);
    await world.admin.page.$eval(PASSWORD_FIELD, (field, caret) => (field as HTMLInputElement).setSelectionRange(caret, caret), CARET);
    await world.admin.page.click(TOGGLE);
    expect(await fieldType(world)).toBe('text');
    expect(await toggleName(world)).toBe(t.common.hidePassword);
    const shown = await world.admin.page.$eval(PASSWORD_FIELD, (field) => ({ value: (field as HTMLInputElement).value, caret: (field as HTMLInputElement).selectionStart, focused: document.activeElement === field }));
    expect(shown).toEqual({ value: TYPED, caret: CARET, focused: true });
    await world.admin.page.click(TOGGLE);
    expect(await fieldType(world)).toBe('password');
    expect(await toggleName(world)).toBe(t.common.showPassword);
    expect(await world.admin.page.$eval(PASSWORD_FIELD, (field) => (field as HTMLInputElement).value)).toBe(TYPED);
  });

  it('the button does not send the form', async () => {
    await world.admin.holds('the prompt open, with no refusal and no admin mode', async () => (await world.admin.exists(TOGGLE)) && !(await world.admin.has(t.shell.unlock.wrong)) && !(await isAdminMode(world.admin)));
  });

  it('after a wrong attempt the button is still there, the password is hidden again, and the prompt did not move', async () => {
    await world.admin.page.click(TOGGLE);
    expect(await fieldType(world)).toBe('text');
    const before = await fieldTop(world);
    await world.admin.fill(PASSWORD_FIELD, WRONG_PASSWORD);
    await world.admin.fill('dialog[open] input[inputmode=numeric]', await rightCode());
    await world.admin.page.keyboard.press('Enter');
    await expectRefused(world.admin);
    expect(await world.admin.exists(TOGGLE)).toBe(true);
    expect(await fieldType(world)).toBe('password');
    expect(await world.admin.page.$eval(PASSWORD_FIELD, (field) => (field as HTMLInputElement).value)).toBe(WRONG_PASSWORD);
    expect(Math.abs((await fieldTop(world)) - before)).toBeLessThan(SAME_PLACE);
  });

  it('the prompt closes and the teacher is still signed out', async () => {
    await world.admin.click(t.common.cancel, 'dialog[open]');
    await world.admin.until('the prompt gone from the page', async () => !(await world.admin.exists('dialog')));
    expect(await isAdminMode(world.admin)).toBe(false);
  });
}
