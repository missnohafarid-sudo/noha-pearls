import type { GroupAnswerStatus } from '../../../domain/answering';
import type { Id, SubjectRef } from '../../../domain/models';
import type { TeacherHeartActions } from '../../hooks/useTeacherHearts';

/** What the panel shows of one group, ready for the overview card and the group's tab alike. */
export interface PearlGroupProps {
  entry: GroupAnswerStatus;
  /** The pearls its score has earned, as the board shows them. */
  pearls: number;
  /** The group's total hearts, as the board shows them. */
  groupHearts: number;
  studentHearts: (studentId: Id) => number;
  /** What the teacher can do about hearts for her or the group. */
  heartsFor: (target: SubjectRef) => TeacherHeartActions;
}
