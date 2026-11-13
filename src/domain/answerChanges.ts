import type { Answer } from './models';

/** What storing a device's answer comes to: nothing to write, refused as changed too often, or the answer to write with its change count. */
export type AnswerStep = { kind: 'same' } | { kind: 'refused' } | { kind: 'write'; changes: number | undefined };

/** A device sending the same answer again changes nothing; changing it is allowed `maxChanges` times. */
export function deviceAnswerStep(existing: Answer | null, value: number | string, maxChanges: number): AnswerStep {
  if (!existing) return { kind: 'write', changes: undefined };
  if (existing.value === value) return { kind: 'same' };
  const changes = existing.changes ?? 0;
  return changes >= maxChanges ? { kind: 'refused' } : { kind: 'write', changes: changes + 1 };
}
