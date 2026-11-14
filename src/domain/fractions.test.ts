import { describe, expect, it } from 'vitest';
import { fractionEdit, lineRuns, type LineRun } from './fractions';
import { isolatedText, plainText } from './textDirection';

const SPEED = 'السرعة';
const ABOUT = 'تقريباً';
const DISTANCE = 'المسافة';
const TIME = 'الزمن';

const run = (ltr: boolean, ...parts: LineRun['parts']): LineRun => ({ ltr, parts });
const over = (top: string, bottom: string) => ({ top, bottom });

describe('lineRuns', () => {
  it('finds a fraction in a line and trims its parts', () => {
    expect(lineRuns('{ 3 / 4 }')).toEqual([run(false, over('3', '4'))]);
  });

  it('keeps an equation with a fraction as one left-to-right run in Arabic text', () => {
    expect(lineRuns(`${SPEED} v = {d/t} ${ABOUT}`)).toEqual([run(false, `${SPEED} `), run(true, 'v = ', over('d', 't')), run(false, ` ${ABOUT}`)]);
  });

  it('finds a fraction whose parts are Arabic', () => {
    expect(lineRuns(`${SPEED} = {${DISTANCE}/${TIME}}`)).toEqual([run(false, `${SPEED} `), run(true, '= ', over(DISTANCE, TIME))]);
    expect(lineRuns(`${SPEED} {${DISTANCE}/${TIME}} ${ABOUT}`)).toEqual([run(false, `${SPEED} `, over(DISTANCE, TIME), ` ${ABOUT}`)]);
  });

  it('finds several fractions, in order', () => {
    expect(lineRuns('x = {1/2} + {3/4}')).toEqual([run(true, 'x = ', over('1', '2'), ' + ', over('3', '4'))]);
  });

  it('leaves other braces, a blank part, or a second slash as ordinary text', () => {
    for (const line of ['{a}', '{ /b}', '{a/ }', '{/}', '{a/b/c}', '{a/b', 'a/b}']) {
      expect(lineRuns(line).flatMap(({ parts }) => parts).every((part) => typeof part === 'string')).toBe(true);
    }
  });

  it('gives the line back once the fractions are written out again', () => {
    for (const line of ['', 'plain', `${SPEED} {a}`, `${SPEED} v = {d/t} ${ABOUT}`, 'x = {1/2}{3/4}', '{a/b/c} and {a/b}']) {
      const written = lineRuns(line)
        .flatMap(({ parts }) => parts)
        .map((part) => (typeof part === 'string' ? part : `{${part.top}/${part.bottom}}`))
        .join('');
      expect(written).toBe(line);
    }
  });

  it('is the same as plain directed runs for a line with no fraction', () => {
    expect(lineRuns(`${SPEED} 25 m/s ${ABOUT}`).map(({ ltr, parts }) => [ltr, parts.join('')])).toEqual([
      [false, `${SPEED} `],
      [true, '25 m/s'],
      [false, ` ${ABOUT}`],
    ]);
  });

  it('drops a stray placeholder character from the text', () => {
    expect(lineRuns('ab')).toEqual([run(true, 'ab')]);
  });
});

describe('the isolating form with fractions', () => {
  const OPEN = '⁦';
  const CLOSE = '⁩';

  it('keeps a fraction inside one isolated piece of its equation', () => {
    expect(isolatedText(`${SPEED} v = {d/t} ${ABOUT}`)).toBe(`${SPEED} ${OPEN}v = {d/t}${CLOSE} ${ABOUT}`);
  });

  it('saves the raw text unchanged', () => {
    for (const text of [`${SPEED} v = {d/t} ${ABOUT}`, `{${DISTANCE}/${TIME}}`, `${SPEED} {a/b} {c/d}`]) expect(plainText(isolatedText(text))).toBe(text);
  });
});

describe('fractionEdit', () => {
  const apply = (text: string, start: number, end: number) => {
    const edit = fractionEdit(text, start, end);
    return { edit, result: text.slice(0, edit.from) + edit.insert + text.slice(edit.to) };
  };

  it('wraps a selection with exactly one slash and puts the caret after the braces', () => {
    const { edit, result } = apply('is 3/4 of it', 3, 6);
    expect(result).toBe('is {3/4} of it');
    expect([edit.selectFrom, edit.selectTo]).toEqual([8, 8]);
  });

  it('inserts an empty fraction at the caret with the caret after the opening brace', () => {
    const { edit, result } = apply('ab', 1, 1);
    expect(result).toBe('a{/}b');
    expect([edit.selectFrom, edit.selectTo]).toEqual([2, 2]);
  });

  it('inserts an empty fraction after a selection that cannot be wrapped', () => {
    expect(apply('a/b/c', 0, 5).result).toBe('a/b/c{/}');
    expect(apply('abc', 0, 3).result).toBe('abc{/}');
    expect(apply('{1/2}', 0, 5).result).toBe('{1/2}{/}');
    expect(apply('1/\n2', 0, 4).result).toBe('1/\n2{/}');
  });

  it('works whichever way the selection was made, and in an empty text', () => {
    expect(apply('3/4', 3, 0).result).toBe('{3/4}');
    expect(apply('', 0, 0).result).toBe('{/}');
  });

  it('writes something drawn as a fraction', () => {
    expect(lineRuns(apply('3/4', 0, 3).result)).toEqual([run(false, over('3', '4'))]);
  });
});
