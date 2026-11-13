import { describe, expect, it } from 'vitest';
import { encode, isWireValue, parseClientMessage, parseServerMessage, type ClientMessage, type ServerMessage } from './wire';
import { MAX_ADMIN_MESSAGE_LENGTH, MAX_MESSAGE_LENGTH } from './limits';

describe('the messages the page sends', () => {
  it('round-trips each shape', () => {
    const messages: ClientMessage[] = [
      { type: 'call', id: 1, service: 'teachers', method: 'add', args: ['منى'] },
      { type: 'watch', id: 2, service: 'teachers', method: 'watchTeachers', args: [] },
      { type: 'unwatch', id: 2 },
    ];
    for (const message of messages) expect(parseClientMessage(encode(message), MAX_MESSAGE_LENGTH)).toEqual(message);
  });

  it('refuses text that is not one of them', () => {
    const bad = [
      'nope', '[]', 'null', '{}', '{"type":"call"}',
      '{"type":"call","id":-1,"service":"a","method":"b","args":[]}',
      '{"type":"call","id":1.5,"service":"a","method":"b","args":[]}',
      '{"type":"call","id":1,"service":"","method":"b","args":[]}',
      '{"type":"call","id":1,"service":"a","method":"b","args":{}}',
      '{"type":"call","id":1,"service":5,"method":"b","args":[]}',
      '{"type":"shout","id":1}',
    ];
    for (const text of bad) expect(parseClientMessage(text, MAX_MESSAGE_LENGTH)).toBeNull();
    expect(parseClientMessage(`{"type":"unwatch","id":1,"pad":"${'x'.repeat(MAX_MESSAGE_LENGTH)}"}`, MAX_MESSAGE_LENGTH)).toBeNull();
    expect(parseClientMessage(`{"type":"unwatch","id":1,"pad":"${'x'.repeat(MAX_MESSAGE_LENGTH)}"}`, MAX_ADMIN_MESSAGE_LENGTH)).toEqual({ type: 'unwatch', id: 1 });
  });
});

describe('the messages the hub sends', () => {
  it('round-trips each shape', () => {
    const messages: ServerMessage[] = [
      { type: 'hello', admin: true, now: 5 },
      { type: 'result', id: 1, ok: true, value: { a: [1, 'b', null] } },
      { type: 'result', id: 2, ok: false, error: { name: 'RosterError', code: 'class-in-use' } },
      { type: 'value', id: 3, value: [] },
      { type: 'watch-refused', id: 4, error: { name: 'NotAuthorizedError' } },
    ];
    for (const message of messages) expect(parseServerMessage(encode(message))).toEqual(message);
  });

  it('refuses malformed text, including an error without a name', () => {
    for (const text of ['x', '{"type":"hello"}', '{"type":"result","id":1,"ok":false,"error":{}}', '{"type":"value"}', '{"type":"other","id":1}']) {
      expect(parseServerMessage(text)).toBeNull();
    }
  });
});

describe('what survives JSON', () => {
  it('accepts plain data', () => {
    expect(isWireValue({ a: [1, 'x', null, { b: false }] })).toBe(true);
  });

  it('rejects what JSON would change or lose', () => {
    for (const value of [undefined, NaN, Infinity, new Map(), new Set(), new Date(), () => 1, [undefined], { a: undefined }, 1n, Symbol('s')]) {
      expect(isWireValue(value)).toBe(false);
    }
  });
});
