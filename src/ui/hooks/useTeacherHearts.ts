import type { ClassRoster, Session, SubjectRef } from '../../domain/models';
import { canGiveTeacherHeart } from '../../domain/rewards';
import { useServices } from '../ServicesContext';
import { useAdmin } from './data';

/** How the teacher gives a heart in this class: for a student or group of the roster, a function that gives it, or undefined when she may not. */
export function useTeacherHearts(session: Session): (roster: ClassRoster, target: SubjectRef) => (() => void) | undefined {
  const { rewards } = useServices();
  const admin = useAdmin();
  return (roster, target) => (admin && canGiveTeacherHeart(session, roster, target) ? () => void rewards.giveAsTeacher(session.id, target) : undefined);
}
