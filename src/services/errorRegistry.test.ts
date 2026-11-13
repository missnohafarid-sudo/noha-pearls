import { describe, expect, it } from 'vitest';
import { CONNECTION_LOST } from '../ports/wire';
import { NotAuthorizedError } from './AuthService';
import { ConnectionLostError, decodeError, encodeError, GENERIC_FAILURE, REGISTERED_ERROR_NAMES, ServiceFailure } from './errorRegistry';
import { LimitError } from './LimitError';
import { LessonError } from './LessonService';
import { FolderError } from './requireFolder';
import { NameError } from './requireName';
import { RetentionError } from './RetentionService';
import { RosterError } from './RosterService';
import { SurfaceError } from './surfaceDispatch';
import { TeacherError } from './TeacherService';

const SAMPLES: Error[] = [
  new NotAuthorizedError(), new NameError(), new RosterError('class-in-use'), new TeacherError('teacher-in-use'), new LessonError('lesson-missing'),
  new FolderError('folder-inside-itself'), new RetentionError('bad-range'), new SurfaceError('wrong-kind'), new LimitError('lookups'), new ConnectionLostError(),
];

describe('the error registry', () => {
  it('has a sample for every registered class', () => {
    expect(SAMPLES.map((error) => error.name).sort()).toEqual([...REGISTERED_ERROR_NAMES].sort());
  });

  it.each(SAMPLES.map((error) => [error.name, error] as const))('sends %s by name and code and gets the same class back', (_name, error) => {
    const wire = encodeError(error);
    expect(wire).not.toBeNull();
    const back = decodeError(JSON.parse(JSON.stringify(wire)));
    expect(back).toBeInstanceOf(error.constructor);
    expect(back.name).toBe(error.name);
    expect((back as Error & { code?: string }).code).toBe((error as Error & { code?: string }).code);
  });

  it('sends nothing but the name and the code', () => {
    expect(Object.keys(encodeError(new RosterError('group-missing')) ?? {}).sort()).toEqual(['code', 'name']);
    expect(Object.keys(encodeError(new NotAuthorizedError()) ?? {})).toEqual(['name']);
  });

  it('does not describe an error it does not know, and the page gets a plain failure', () => {
    expect(encodeError(new Error('secret detail'))).toBeNull();
    expect(encodeError(new TypeError('x'))).toBeNull();
    expect(encodeError('text')).toBeNull();
    const impostor = new Error('x');
    impostor.name = 'constructor';
    expect(encodeError(impostor)).toBeNull();
    expect(decodeError(GENERIC_FAILURE)).toBeInstanceOf(ServiceFailure);
    expect(decodeError({ name: 'toString' })).toBeInstanceOf(ServiceFailure);
  });

  it('turns a lost connection into its own class', () => {
    expect(decodeError({ name: CONNECTION_LOST })).toBeInstanceOf(ConnectionLostError);
  });
});
