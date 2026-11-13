import type { GroupAnswerStatus } from './answering';
import type { Student } from './models';

export interface StudentProgress {
  /** How many of her present students have answered; 0 for a group question or no question. */
  answered: number;
  /** How many of her students the question counts. */
  expected: number;
  /** The students the question counts who have not answered, in card number order. */
  waiting: Student[];
}

/** How far one group's students have come on an individual question, read from the marks `answerStatusByGroup` gave. */
export function studentProgress(entry: GroupAnswerStatus): StudentProgress {
  const counted = entry.students.filter(({ mark }) => mark !== null);
  const waiting = counted.filter(({ mark }) => mark === 'waiting').map(({ student }) => student);
  return { answered: counted.length - waiting.length, expected: counted.length, waiting };
}
