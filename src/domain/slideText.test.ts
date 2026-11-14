import { describe, expect, it } from 'vitest';
import { F, flatten, hidden, line, lines, OTHER, PHOTO, pictures, table } from './slideText.fixtures';
import { hiddenPartKeys, keepOpenedParts, partKey, slideTextBlocks } from './slideText';

describe('slideTextBlocks: plain lines', () => {
  it('is empty for an empty or blank text', () => {
    expect(slideTextBlocks('')).toEqual([]);
    expect(slideTextBlocks('  \n\n \t\n')).toEqual([]);
  });

  it('gives one line block per non-blank line, in order', () => {
    expect(slideTextBlocks('one\n\n  \ntwo')).toEqual([line('one'), line('two')]);
  });

  it('keeps an ordinary line as it is', () => {
    expect(slideTextBlocks('  indented ')).toEqual([line('  indented ')]);
  });

  it('turns a line starting with "- " into a bullet holding the rest', () => {
    expect(slideTextBlocks('- first\n   - second')).toEqual([line('first', true), line('second', true)]);
  });

  it('does not turn a dash without a space into a bullet', () => {
    expect(slideTextBlocks('-5 degrees')).toEqual([line('-5 degrees')]);
  });
});

describe('slideTextBlocks: hidden blocks', () => {
  it('has none without a fence', () => {
    expect(slideTextBlocks(lines('a', 'b')).some((block) => block.kind === 'hidden')).toBe(false);
  });

  it('holds the lines between two fences in one block, in the middle', () => {
    expect(slideTextBlocks(lines('a', F, 'secret', F, 'b'))).toEqual([line('a'), hidden(line('secret')), line('b')]);
  });

  it('allows a block first and a block last', () => {
    expect(slideTextBlocks(lines(F, 's', F, 'a'))).toEqual([hidden(line('s')), line('a')]);
    expect(slideTextBlocks(lines('a', F, 's', F))).toEqual([line('a'), hidden(line('s'))]);
  });

  it('allows two and three blocks', () => {
    expect(slideTextBlocks(lines('a', F, 's1', F, 'b', F, 's2', F, 'c'))).toEqual([line('a'), hidden(line('s1')), line('b'), hidden(line('s2')), line('c')]);
    expect(slideTextBlocks(lines(F, '1', F, 'x', F, '2', F, 'y', F, '3', F))).toEqual([hidden(line('1')), line('x'), hidden(line('2')), line('y'), hidden(line('3'))]);
  });

  it('allows blocks that follow each other', () => {
    expect(slideTextBlocks(lines(F, 'one', F, F, 'two', F))).toEqual([hidden(line('one')), hidden(line('two'))]);
  });

  it('hides everything to the end when the last fence is never closed', () => {
    expect(slideTextBlocks(lines('a', F, 'b', 'c'))).toEqual([line('a'), hidden(line('b'), line('c'))]);
  });

  it('closes a block at the next fence, never nesting', () => {
    expect(slideTextBlocks(lines(F, 'a', F, 'b', F, 'c'))).toEqual([hidden(line('a')), line('b'), hidden(line('c'))]);
  });

  it('drops an empty block and a block of only blank lines', () => {
    expect(slideTextBlocks(lines('a', F, F, 'b'))).toEqual([line('a'), line('b')]);
    expect(slideTextBlocks(lines('a', F, '', '   ', F, 'b'))).toEqual([line('a'), line('b')]);
    expect(slideTextBlocks(F)).toEqual([]);
    expect(slideTextBlocks(lines(F, ''))).toEqual([]);
  });

  it('accepts a fence with spaces around it and with four or more plus signs', () => {
    expect(slideTextBlocks(lines('a', `  ${F}  `, 's', '\t+++++', 'b'))).toEqual([line('a'), hidden(line('s')), line('b')]);
    expect(slideTextBlocks(lines('++++++', 's', '++++'))).toEqual([hidden(line('s'))]);
  });

  it('reads Windows line endings without leaving a carriage return on a fence or a line', () => {
    expect(slideTextBlocks(`a\r\n${F}\r\ns\r\n${F}\r\nb`)).toEqual([line('a'), hidden(line('s')), line('b')]);
  });

  it('treats a plus run inside a longer line, and two plus signs, as ordinary text', () => {
    expect(slideTextBlocks('a +++ b')).toEqual([line('a +++ b')]);
    expect(slideTextBlocks('+++ b')).toEqual([line('+++ b')]);
    expect(slideTextBlocks('++')).toEqual([line('++')]);
    expect(slideTextBlocks('1 ++ 1')).toEqual([line('1 ++ 1')]);
  });

  it('draws bullets inside a hidden block', () => {
    expect(slideTextBlocks(lines(F, '- one', 'two', F))).toEqual([hidden(line('one', true), line('two'))]);
  });
});

describe('slideTextBlocks: pictures', () => {
  it('turns a line that is only an https address into a picture', () => {
    expect(slideTextBlocks(PHOTO)).toEqual([pictures(PHOTO)]);
    expect(slideTextBlocks(`   ${PHOTO}  `)).toEqual([pictures(PHOTO)]);
  });

  it('joins consecutive picture lines into one block', () => {
    expect(slideTextBlocks(lines(PHOTO, OTHER))).toEqual([pictures(PHOTO, OTHER)]);
  });

  it('makes two blocks of picture lines separated by text', () => {
    expect(slideTextBlocks(lines(PHOTO, 'between', OTHER))).toEqual([pictures(PHOTO), line('between'), pictures(OTHER)]);
  });

  it('puts a picture between two visible lines where it stands', () => {
    expect(slideTextBlocks(lines('a', PHOTO, 'b'))).toEqual([line('a'), pictures(PHOTO), line('b')]);
  });

  it('draws a picture line inside a hidden block', () => {
    expect(slideTextBlocks(lines('a', F, '- s', PHOTO, F))).toEqual([line('a'), hidden(line('s', true), pictures(PHOTO))]);
  });

  it('does not join pictures across a hidden block', () => {
    expect(slideTextBlocks(lines(PHOTO, F, OTHER, F, PHOTO))).toEqual([pictures(PHOTO), hidden(pictures(OTHER)), pictures(PHOTO)]);
  });

  it('draws an image file, a Giphy page and a Drive file as pictures', () => {
    const giphy = 'https://giphy.com/gifs/cat-abc123';
    const drive = 'https://drive.google.com/file/d/FILE_ID_1/view';
    expect(slideTextBlocks(lines(giphy, drive))).toEqual([pictures(giphy, drive)]);
  });

  it('leaves a web page, a YouTube link and a Tenor page as ordinary text', () => {
    for (const link of ['https://example.org/page', 'https://www.youtube.com/watch?v=abc', 'https://tenor.com/view/cat-123']) expect(slideTextBlocks(link)).toEqual([line(link)]);
  });

  it('leaves an http address, and a link with words, as ordinary text', () => {
    expect(slideTextBlocks('http://example.org/a.png')).toEqual([line('http://example.org/a.png')]);
    expect(slideTextBlocks(`see ${PHOTO}`)).toEqual([line(`see ${PHOTO}`)]);
    expect(slideTextBlocks(`${PHOTO} here`)).toEqual([line(`${PHOTO} here`)]);
  });
});

describe('slideTextBlocks: nothing is lost or duplicated', () => {
  const texts = [
    lines('a', F, 'b', F, 'c'),
    lines(F, 'a', 'b'),
    lines('- a', PHOTO, F, '- b', OTHER, F, 'c', F, F, 'd', F, PHOTO),
    `x\r\n${F}\r\n\r\ny\r\n\r\n${F}\r\n${PHOTO}`,
    lines('', '  ', 'one', '++', '+++ no', 'http://example.org/x.png', 'https://example.org/page', F, '  two  ', ' +++++ ', 'three'),
    lines(F, F, F, 'a', F),
  ];

  it.each(texts.map((text, index) => [index, text] as const))('keeps every other line once and in order (text %i)', (_index, text) => {
    const expected = text
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter((row) => row !== '' && !/^\+{3,}$/.test(row));
    expect(flatten(slideTextBlocks(text))).toEqual(expected);
  });
});

describe('hidden parts: keys and cutting', () => {
  const text = lines('a', F, 's0', F, 'b', F, F, F, 's1', 'more', F, 'c');
  const [k0, k1] = [partKey('s0'), partKey(lines('s1', 'more'))];

  it('lists the keys of the parts that hold something, in reading order, and none for an empty one', () => {
    expect(hiddenPartKeys('plain')).toEqual([]);
    expect(hiddenPartKeys(text)).toEqual([k0, k1]);
    expect(hiddenPartKeys(lines('a', F, 'b', 'c'))).toEqual([partKey(lines('b', 'c'))]);
  });

  it('names a part by its own trimmed lines, wherever it stands', () => {
    expect(partKey('  one \n\n two')).toBe(partKey(lines('one', 'two')));
    expect(partKey('one')).not.toBe(partKey('two'));
    expect(partKey('one')).toMatch(/^[0-9a-f]{8}$/);
    expect(hiddenPartKeys(lines(F, 'x', F, F, 'y', F, F, '  s0 ', F))[2]).toBe(k0);
  });

  it('carries the key on the hidden block', () => {
    const blocks = slideTextBlocks(text);
    expect(blocks.flatMap((block) => (block.kind === 'hidden' ? [block.key] : []))).toEqual([k0, k1]);
  });

  it('gives two parts with the same words the same key', () => {
    const twice = lines(F, 'same', F, F, 'other', F, F, 'same', F);
    expect(hiddenPartKeys(twice)).toEqual([partKey('same'), partKey('other'), partKey('same')]);
    expect(keepOpenedParts(twice, [partKey('same')])).toBe(lines(F, 'same', F, F, 'same', F));
  });

  it('cuts every part not opened, fences included, and leaves an opened one as it is', () => {
    expect(keepOpenedParts(text, [])).toBe(lines('a', 'b', 'c'));
    expect(keepOpenedParts(text, [k0])).toBe(lines('a', F, 's0', F, 'b', 'c'));
    expect(keepOpenedParts(text, [k1])).toBe(lines('a', 'b', F, 's1', 'more', F, 'c'));
    expect(keepOpenedParts(text, [k0, k1, 'ffffffff'])).toBe(lines('a', F, 's0', F, 'b', F, 's1', 'more', F, 'c'));
  });

  it('keeps an opened part open when a part is added or removed above it', () => {
    const above = lines(F, 'new', F, text);
    expect(keepOpenedParts(above, [k1])).toBe(lines('a', 'b', F, 's1', 'more', F, 'c'));
    expect(keepOpenedParts(lines('a', 'b', F, 's1', 'more', F, 'c'), [k1])).toBe(lines('a', 'b', F, 's1', 'more', F, 'c'));
  });

  it('closes a part whose words were edited', () => {
    expect(keepOpenedParts(lines(F, 's0 changed', F), [k0])).toBe('');
  });

  it('cuts a part that is never closed, and leaves a text without parts alone', () => {
    expect(keepOpenedParts(lines('a', F, 'b', 'c'), [])).toBe('a');
    expect(keepOpenedParts('x\ny', [k0])).toBe('x\ny');
  });

  it('knows no part in a stretch that draws nothing, and cuts it', () => {
    const empty = lines('a', F, '', '  ', F, 'b', F, '|---|', '|:-:|', F, 'c');
    expect(hiddenPartKeys(empty)).toEqual([]);
    expect(slideTextBlocks(empty)).toEqual([line('a'), line('b'), line('c')]);
    expect(keepOpenedParts(empty, [partKey(''), partKey(lines('|---|', '|:-:|'))])).toBe(lines('a', 'b', 'c'));
  });

  it('keeps the parts that remain readable as the same blocks', () => {
    expect(slideTextBlocks(keepOpenedParts(text, [k1]))).toEqual([line('a'), line('b'), hidden(line('s1'), line('more')), line('c')]);
  });
});

describe('slideTextBlocks: tables', () => {
  it('makes one table of consecutive row lines, cells trimmed', () => {
    expect(slideTextBlocks('|a|b|\n  | c | d |  ')).toEqual([table(null, ['a', 'b'], ['c', 'd'])]);
  });

  it('makes the first row the header when a row of dashes follows it, and never draws that row', () => {
    expect(slideTextBlocks('|a|b|\n|---|---|\n|1|2|')).toEqual([table(['a', 'b'], ['1', '2'])]);
    expect(slideTextBlocks('| a | b |\n| :--- | ---: |\n| 1 | 2 |')).toEqual([table(['a', 'b'], ['1', '2'])]);
  });

  it('drops a row of dashes anywhere else, and a table of nothing else', () => {
    expect(slideTextBlocks('|a|b|\n|1|2|\n|---|---|\n|3|4|')).toEqual([table(null, ['a', 'b'], ['1', '2'], ['3', '4'])]);
    expect(slideTextBlocks('|---|---|\n|:-:|---|')).toEqual([]);
    expect(slideTextBlocks('|a|\n|---|\n|---|\n|1|')).toEqual([table(['a'], ['1'])]);
  });

  it('pads rows shorter than the widest, header included', () => {
    expect(slideTextBlocks('|a|\n|---|\n|1|2|3|')).toEqual([table(['a', '', ''], ['1', '2', '3'])]);
    expect(slideTextBlocks('|1|\n|2|3|')).toEqual([table(null, ['1', ''], ['2', '3'])]);
  });

  it('needs more than a lone bar, and a bar at both ends', () => {
    expect(slideTextBlocks('|')).toEqual([line('|')]);
    expect(slideTextBlocks('a | b')).toEqual([line('a | b')]);
    expect(slideTextBlocks('|a')).toEqual([line('|a')]);
    expect(slideTextBlocks('||')).toEqual([line('||')]);
    expect(slideTextBlocks('||\n||')).toEqual([table(null, [''], [''])]);
  });

  it('leaves one line between bars as an ordinary line: an absolute value is not a table', () => {
    expect(slideTextBlocks('|x|')).toEqual([line('|x|')]);
    expect(slideTextBlocks('|-3| = |3|')).toEqual([line('|-3| = |3|')]);
    expect(slideTextBlocks('|---|')).toEqual([line('|---|')]);
    expect(slideTextBlocks(lines('|x|', 'text', '|y|'))).toEqual([line('|x|'), line('text'), line('|y|')]);
  });

  it('makes a table of two rows, and of a header with its row of dashes', () => {
    expect(slideTextBlocks('|a|b|\n|1|2|')).toEqual([table(null, ['a', 'b'], ['1', '2'])]);
    expect(slideTextBlocks('|a|b|\n|---|---|')).toEqual([table(['a', 'b'])]);
  });

  it('leaves a bullet that contains bars as a bullet', () => {
    expect(slideTextBlocks('- |a|b|')).toEqual([line('|a|b|', true)]);
  });

  it('splits tables around other lines, and keeps a table inside a hidden part', () => {
    expect(slideTextBlocks(lines('|a|', '|b|', 'text', '|c|', '|d|'))).toEqual([table(null, ['a'], ['b']), line('text'), table(null, ['c'], ['d'])]);
    expect(slideTextBlocks(lines('|a|b|', '|c|d|', F, '|s|t|', '|u|v|', F, 'end'))).toEqual([table(null, ['a', 'b'], ['c', 'd']), hidden(table(null, ['s', 't'], ['u', 'v'])), line('end')]);
  });

  it('keeps a table of an opened hidden part whole when other parts are cut', () => {
    const text = lines('|a|b|', '|a2|b2|', F, 'x', F, F, '|c|d|', '|c2|d2|', F, F, '|e|f|', '|---|---|', '|1|2|', F, '|g|h|', '|g2|h2|');
    expect(slideTextBlocks(keepOpenedParts(text, [partKey(lines('|e|f|', '|---|---|', '|1|2|'))]))).toEqual([
      table(null, ['a', 'b'], ['a2', 'b2']),
      hidden(table(['e', 'f'], ['1', '2'])),
      table(null, ['g', 'h'], ['g2', 'h2']),
    ]);
  });
});
