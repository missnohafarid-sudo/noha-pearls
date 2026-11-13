import { describe, expect, it } from 'vitest';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import { createDataServices } from './createDataServices';
import { LOCAL_SURFACE, UI_SURFACE } from './Services';
import { isLocalMethod, surfaceKind } from './surfaceDispatch';

const services = createDataServices(new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'shape'), { isAdmin: () => true, deviceId: () => 'd' });

/** The text between the first pair of brackets of a function's source: its parameter list. */
function parameterList(method: (...args: never[]) => unknown): string {
  const source = Function.prototype.toString.call(method);
  const start = source.indexOf('(');
  let depth = 0;
  for (let at = start; at < source.length; at += 1) {
    if (source[at] === '(') depth += 1;
    if (source[at] === ')' && --depth === 0) return source.slice(start + 1, at);
  }
  return source;
}

describe('the parameters of every method on the surface', () => {
  it('are plain: none has a default or a rest parameter, which `Function.length` would not count, so the hub’s argument count is the declared one', () => {
    const odd: string[] = [];
    for (const [service, names] of Object.entries(UI_SURFACE)) {
      for (const name of names as readonly string[]) {
        const method = (services as unknown as Record<string, Record<string, (...args: never[]) => unknown>>)[service][name];
        expect(typeof method, `${service}.${name}`).toBe('function');
        if (/=|\.\.\./.test(parameterList(method))) odd.push(`${service}.${name}(${parameterList(method)})`);
      }
    }
    expect(odd).toEqual([]);
  });

  it('count one more for a live read than the arguments the page sends, the listener being the last', () => {
    expect(services.teachers.watchTeachers.length).toBe(1);
    expect(services.roster.watchRoster.length).toBe(2);
    expect(services.teachers.rename.length).toBe(2);
  });
});

describe('the names the page answers itself', () => {
  it('are on the surface, and are not names the hub will run', () => {
    for (const [service, names] of Object.entries(LOCAL_SURFACE)) {
      for (const name of names as readonly string[]) {
        expect((UI_SURFACE as Record<string, readonly string[]>)[service]).toContain(name);
        expect(isLocalMethod(service, name)).toBe(true);
        expect(surfaceKind(service, name)).toBeNull();
      }
    }
    expect(isLocalMethod('teachers', 'add')).toBe(false);
    expect(isLocalMethod('constructor', 'name')).toBe(false);
    expect(surfaceKind('teachers', 'add')).toBe('call');
  });
});
