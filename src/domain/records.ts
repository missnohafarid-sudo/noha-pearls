import { isPresent } from './attendance';
import { interactionsOf, isUnresponsive } from './engagement';
import type { Answer, AttendedRoster, ClassRecord, Lesson, Session } from './models';
import { scoreboard, studentPoints, teacherKeys } from './scoring';

/**
 * The single home for what an ended class is kept as: its results as the teacher saw them, from the rules that mark and count.
 * The record is marked as the teacher's monitor is (`teacherKeys`), so a question she never revealed still earns its points;
 * the public board shows revealed questions only.
 */

export function classRecord(session: Session, lesson: Lesson, roster: AttendedRoster, answers: readonly Answer[]): ClassRecord {
  const keys = teacherKeys(session);
  return {
    id: session.id,
    classId: session.classId,
    startedAt: session.startedAt,
    students: roster.students.map((student) => {
      const present = isPresent(roster, student.id);
      return {
        studentId: student.id,
        name: student.name,
        groupId: student.groupId,
        present,
        answered: interactionsOf(lesson, roster, answers, student.id),
        points: present ? studentPoints(lesson, roster, student.id, answers, keys) : 0,
        unresponsive: isUnresponsive(session, lesson, roster, answers, student.id),
      };
    }),
    groups: scoreboard(lesson, roster, answers, keys).map((score, index) => ({
      groupId: score.groupId,
      name: roster.groups[index].name,
      score: score.score,
      max: score.max,
    })),
  };
}
