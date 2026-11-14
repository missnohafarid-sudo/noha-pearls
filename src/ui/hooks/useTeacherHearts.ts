import type { ClassRoster, Session, SubjectRef } from '../../domain/models';
import { canGiveTeacherHeart } from '../../domain/rewards';
import { useServices } from '../ServicesContext';
import { useAdmin } from './data';

/** What the teacher can do about the hearts of one target: each action is present only when she may do it. */
export interface TeacherHeartActions {
  onGive?: () => void;
}

/** What the teacher can do about hearts in this class, for a student or group of the roster; spread into `HeartButton`. */
export function useTeacherHearts(session: Session): (roster: ClassRoster, target: SubjectRef) => TeacherHeartActions {
  const { rewards } = useServices();
  const admin = useAdmin();
  return (roster, target) =>
    admin && canGiveTeacherHeart(session, roster, target)
      ? { onGive: () => void rewards.giveAsTeacher(session.id, target) }
      : {};
}
