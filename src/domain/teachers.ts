import { newId } from './ids';
import { nextOrder } from './lists';
import type { Teacher } from './models';

/** Rules for the list of teachers a class can be started by. */

/** `existing` are the teachers already listed; the new one goes last. */
export function createTeacher(name: string, existing: readonly Teacher[]): Teacher {
  return { id: newId(), name, order: nextOrder(existing) };
}
