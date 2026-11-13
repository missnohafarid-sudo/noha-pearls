import type { GroupAnswerStatus } from '../../../domain/answering';
import type { Id, SubjectRef } from '../../../domain/models';

/** What the panel shows of one group, ready for the overview card and the group's tab alike. */
export interface PearlGroupProps {
  entry: GroupAnswerStatus;
  /** The pearls its score has earned, as the board shows them. */
  pearls: number;
  /** The group's total hearts, as the board shows them. */
  groupHearts: number;
  studentHearts: (studentId: Id) => number;
  /** How a heart is given to her or the group; undefined when it may not be. */
  giveTo: (target: SubjectRef) => (() => void) | undefined;
}
