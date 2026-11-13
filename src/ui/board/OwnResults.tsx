import type { ReactNode } from 'react';
import type { RewardTally } from '../../domain/analytics';
import { studentReport } from '../../domain/analytics';
import type { Answer, AttendedRoster, Group, Lesson, Session, Student } from '../../domain/models';
import { MyResults } from './MyResults';

interface OwnResultsProps {
  session: Session;
  lesson: Lesson;
  roster: AttendedRoster;
  answers: readonly Answer[];
  student: Student;
  group: Group | null;
  hearts: RewardTally;
  onHide: () => void;
  children?: ReactNode;
}

/** A named student's own results card, on her device or on the board. */
export function OwnResults({ session, lesson, roster, answers, student, group, hearts, onHide, children }: OwnResultsProps) {
  return (
    <MyResults student={student} group={group} report={studentReport(lesson, session, roster, student, answers)} hearts={hearts} onHide={onHide}>
      {children}
    </MyResults>
  );
}
