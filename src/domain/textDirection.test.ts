import { describe, expect, it } from 'vitest';
import { deleteBesideMarks, directedRuns, isolatedText, plainPosition, plainText, shownPosition } from './textDirection';

const SPEED = 'سرعتها';
const ABOUT = 'تقريبًا';
const EQUALS = 'تساوي';
const IN = 'في';
const YEAR = 'عام';
const SEE = 'انظر';
const PAGES = 'الصفحات';
const FROM = 'من';
const WORD = 'كلمة';
const ARABIC_COMMA = '،';
const INDIC_DIGITS = '٢٠٢٦';

/** Written as [text, ltr] pairs so a case reads as the line itself. */
const run = (text: string, ltr: boolean) => ({ text, ltr });
const L = (text: string) => run(text, true);
const A = (text: string) => run(text, false);

const cases: [string, string, ReturnType<typeof run>[]][] = [
  ['empty line has no runs', '', []],
  ['all Arabic is one plain run', `${SPEED} ${ABOUT}`, [A(`${SPEED} ${ABOUT}`)]],
  ['only Western digits stay plain', '12345', [A('12345')]],
  ['Arabic-Indic digits count as Arabic context', `${INDIC_DIGITS} x`, [A(`${INDIC_DIGITS} `), L('x')]],
  ['all-English line keeps its full stop inside', 'This line is all English, with a full stop.', [L('This line is all English, with a full stop.')]],
  ['run in the middle', `${SPEED} 20 m/s ${ABOUT}`, [A(`${SPEED} `), L('20 m/s'), A(` ${ABOUT}`)]],
  ['an email stays in one piece', `${WORD} name@example.com ${ABOUT}`, [A(`${WORD} `), L('name@example.com'), A(` ${ABOUT}`)]],
  ['a web address with a query stays in one piece', `${SEE} https://example.com/a?b=c&d=1#top ${ABOUT}`, [A(`${SEE} `), L('https://example.com/a?b=c&d=1#top'), A(` ${ABOUT}`)]],
  ['letters joined by an ampersand stay in one piece', `${WORD} Q&A ${ABOUT}`, [A(`${WORD} `), L('Q&A'), A(` ${ABOUT}`)]],
  ['a question mark after an English word stays outside', `${WORD} x? ${ABOUT}`, [A(`${WORD} `), L('x'), A(`? ${ABOUT}`)]],
  ['run at the start', `F = ma ${IN} ${WORD}`, [L('F = ma'), A(` ${IN} ${WORD}`)]],
  ['run at the end', `${WORD} ${IN} F = ma`, [A(`${WORD} ${IN} `), L('F = ma')]],
  ['two runs in one line', `${WORD} m ${IN} a ${FROM} s`, [A(`${WORD} `), L('m'), A(` ${IN} `), L('a'), A(` ${FROM} `), L('s')]],
  ['formula name', `${WORD} H2O ${WORD}`, [A(`${WORD} `), L('H2O'), A(` ${WORD}`)]],
  ['compound equation', `${WORD} CO2 + H2O ${WORD}`, [A(`${WORD} `), L('CO2 + H2O'), A(` ${WORD}`)]],
  ['spaced equation', `${WORD}: v = d / t`, [A(`${WORD}: `), L('v = d / t')]],
  ['full stop stays outside', `${EQUALS} 5 N.`, [A(`${EQUALS} `), L('5 N'), A('.')]],
  ['colon and spaces fall outside', `${WORD}: F = ma`, [A(`${WORD}: `), L('F = ma')]],
  ['letterless equation', `${WORD} 3 + 4 = 7 ${WORD}`, [A(`${WORD} `), L('3 + 4 = 7'), A(` ${WORD}`)]],
  ['letterless equation alone in an Arabic-free line', '3 + 4 = 7', [L('3 + 4 = 7')]],
  ['multiplication and inequality', `${WORD} 2 × 3 ≤ 7`, [A(`${WORD} `), L('2 × 3 ≤ 7')]],
  ['signed number', `${WORD} -5 ${WORD}`, [A(`${WORD} `), L('-5'), A(` ${WORD}`)]],
  ['signed decimal with a minus sign', `${WORD} −2.5`, [A(`${WORD} `), L('−2.5')]],
  ['Greek letters and superscripts', `${WORD} Δx = v²`, [A(`${WORD} `), L('Δx = v²')]],
  ['brackets kept when the partner is inside', `${WORD} (F = ma) ${WORD}`, [A(`${WORD} `), L('(F = ma)'), A(` ${WORD}`)]],
  ['brackets left outside without a partner', `(${SEE} Fig. 2)`, [A(`(${SEE} `), L('Fig. 2'), A(')')]],
  ['opening bracket before an Arabic word stays outside', `${WORD} (x ${WORD})`, [A(`${WORD} (`), L('x'), A(` ${WORD})`)]],
  ['lone number is left to the browser', `${IN} ${YEAR} 2026`, [A(`${IN} ${YEAR} 2026`)]],
  ['percentage is left to the browser', `${WORD} 50% ${WORD}`, [A(`${WORD} 50% ${WORD}`)]],
  ['decimal is left to the browser', `${WORD} 3.5 ${WORD}`, [A(`${WORD} 3.5 ${WORD}`)]],
  ['date is left to the browser', `${WORD} 12/5/2026 ${WORD}`, [A(`${WORD} 12/5/2026 ${WORD}`)]],
  ['time is left to the browser', `${WORD} 10:30 ${WORD}`, [A(`${WORD} 10:30 ${WORD}`)]],
  ['range is left to the browser', `${FROM} 5-10 ${WORD}`, [A(`${FROM} 5-10 ${WORD}`)]],
  ['list of numbers is left to the browser', `${PAGES} 12${ARABIC_COMMA} 15 ${FROM} 5-10`, [A(`${PAGES} 12${ARABIC_COMMA} 15 ${FROM} 5-10`)]],
  ['comma list of numbers', `${WORD} 1, 2, 3 ${WORD}`, [A(`${WORD} 1, 2, 3 ${WORD}`)]],
  ['dash between Arabic words is plain', `${WORD} - ${WORD}`, [A(`${WORD} - ${WORD}`)]],
  ['accented Latin letters', `${WORD} café ${WORD}`, [A(`${WORD} `), L('café'), A(` ${WORD}`)]],
];

describe('directedRuns', () => {
  it.each(cases)('%s', (_name, line, expected) => {
    expect(directedRuns(line)).toEqual(expected);
  });

  it.each(cases)('keeps every character: %s', (_name, line) => {
    expect(directedRuns(line).map((r) => r.text).join('')).toBe(line);
  });
});

describe('the isolating form of a text', () => {
  const OPEN = '⁦';
  const CLOSE = '⁩';
  const samples = [
    '',
    'This line is all English, with a full stop.',
    `${SPEED} ${ABOUT}`,
    `${SPEED} 25°C`,
    `${SPEED} 20 m/s ${ABOUT}`,
    `F = ma ${IN} ${WORD}`,
    `${WORD} ${IN} F = ma`,
    `${WORD} CO2 + H2O ${WORD}\n${SPEED} x`,
    `${WORD}: v = d / t\r\nEnglish only\r\n${SPEED}`,
    `${WORD}\n+++\n${SPEED} 25°C\n+++\n${ABOUT}`,
    `${SPEED}\nhttps://example.com/pic.png\n${ABOUT} 3 + 4 = 7`,
    `\n\n${SPEED} a\n`,
  ];

  it('fences each left-to-right piece inside Arabic', () => {
    expect(isolatedText(`${SPEED} 25°C ${ABOUT}`)).toBe(`${SPEED} ${OPEN}25°C${CLOSE} ${ABOUT}`);
    expect(isolatedText(`F = ma ${IN} ${WORD}`)).toBe(`${OPEN}F = ma${CLOSE} ${IN} ${WORD}`);
    expect(isolatedText(`${WORD} m ${IN} a`)).toBe(`${WORD} ${OPEN}m${CLOSE} ${IN} ${OPEN}a${CLOSE}`);
  });

  it('keeps line breaks and works line by line', () => {
    expect(isolatedText(`${SPEED} x\r\nplain English\n${SPEED} y`)).toBe(`${SPEED} ${OPEN}x${CLOSE}\r\nplain English\n${SPEED} ${OPEN}y${CLOSE}`);
  });

  it('leaves untouched what has no Arabic, no piece, or nothing', () => {
    for (const text of ['', 'All English 1 + 1 = 2', `${SPEED} ${ABOUT}`, '12345']) expect(isolatedText(text)).toBe(text);
  });

  it('gives the text back once the marks are removed', () => {
    for (const text of samples) {
      expect(plainText(isolatedText(text))).toBe(text);
      expect(isolatedText(plainText(isolatedText(text)))).toBe(isolatedText(text));
    }
  });

  it('removes marks wherever they are', () => {
    expect(plainText(`a${OPEN}b${CLOSE}${CLOSE}${OPEN}c`)).toBe('abc');
  });

  it('maps every position there and back', () => {
    for (const text of samples) {
      const shown = isolatedText(text);
      for (let position = 0; position <= text.length; position += 1) {
        expect(plainPosition(shown, shownPosition(text, position))).toBe(position);
      }
    }
  });

  it('puts a position at the start of a piece before its opening mark and at the end after its closing mark', () => {
    const text = `${SPEED} 25°C ${ABOUT}`;
    const shown = isolatedText(text);
    const start = text.indexOf('25');
    const end = start + '25°C'.length;
    expect(shown[shownPosition(text, start)]).toBe(OPEN);
    expect(shown[shownPosition(text, end) - 1]).toBe(CLOSE);
    expect(shownPosition(text, start + 1)).toBe(start + 2);
  });

  it('counts only the saved characters before a position in the box', () => {
    const shown = isolatedText(`${SPEED} 25°C`);
    expect(plainPosition(shown, shown.length)).toBe(`${SPEED} 25°C`.length);
    expect(plainPosition(shown, shown.indexOf(OPEN) + 1)).toBe(SPEED.length + 1);
  });
});

describe('deleteBesideMarks', () => {
  const text = 'الشرح 25°C';

  it('removes the last character of a piece when the caret is right after it', () => {
    expect(deleteBesideMarks(text, text.length, 'backward')).toEqual({ text: 'الشرح 25°', caret: text.length - 1 });
    expect(deleteBesideMarks('الشرح 25°', 'الشرح 25°'.length, 'backward')).toEqual({ text: 'الشرح 25', caret: 8 });
  });

  it('removes the first character of a piece when the caret is right before it', () => {
    expect(deleteBesideMarks(text, 6, 'forward')).toEqual({ text: 'الشرح 5°C', caret: 6 });
  });

  it('does nothing at the start going back or at the end going forward', () => {
    expect(deleteBesideMarks(text, 0, 'backward')).toEqual({ text, caret: 0 });
    expect(deleteBesideMarks(text, text.length, 'forward')).toEqual({ text, caret: text.length });
    expect(deleteBesideMarks('', 0, 'backward')).toEqual({ text: '', caret: 0 });
  });

  it('removes the character next to the caret between two pieces', () => {
    const two = 'x=1 و y=2';
    expect(deleteBesideMarks(two, 3, 'backward')).toEqual({ text: 'x= و y=2', caret: 2 });
    expect(deleteBesideMarks(two, 6, 'forward')).toEqual({ text: 'x=1 و =2', caret: 6 });
  });

  it('removes a whole pair of code units at once and keeps the caret inside the text', () => {
    expect(deleteBesideMarks('a😀', 3, 'backward')).toEqual({ text: 'a', caret: 1 });
    expect(deleteBesideMarks('😀a', 0, 'forward')).toEqual({ text: 'a', caret: 0 });
    expect(deleteBesideMarks('ab', 9, 'backward')).toEqual({ text: 'a', caret: 1 });
  });
});
