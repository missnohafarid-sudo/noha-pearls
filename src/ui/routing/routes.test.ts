import { describe, expect, it } from 'vitest';
import { homeRoute, parseRoute, routeHash } from './routes';

describe('home routes', () => {
  it('the top level is #/ and a folder is #/folder/<id>', () => {
    expect(routeHash({ name: 'home' })).toBe('#/');
    expect(routeHash({ name: 'home', folderId: 'f 1' })).toBe('#/folder/f%201');
  });

  it('reads both addresses back', () => {
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/folder/f%201')).toEqual({ name: 'home', folderId: 'f 1' });
  });

  it('a folder address without an id is the top level', () => {
    expect(parseRoute('#/folder')).toEqual({ name: 'home' });
  });

  it('homeRoute names a folder, or the top level for null', () => {
    expect(homeRoute(null)).toEqual({ name: 'home' });
    expect(homeRoute('f')).toEqual({ name: 'home', folderId: 'f' });
  });
});
