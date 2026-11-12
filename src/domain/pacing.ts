import { clampIndex } from './lessonOps';
import type { GroupPacing, Id, PacingMode, Session, TeacherMessage } from './models';

/** The single home for "which slide does this group's device show right now". */

export const PACING_MODES: readonly PacingMode[] = ['follow', 'free', 'hold', 'pinned'];

const FOLLOW: GroupPacing = { mode: 'follow', slideIndex: 0 };

export function pacingOf(session: Session, groupId: Id): GroupPacing {
  return session.pacing[groupId] ?? FOLLOW;
}

/** Builds the pacing value for a mode; `pinned` pins to the teacher's current slide. */
export function pacingFor(mode: PacingMode, session: Session): GroupPacing {
  return { mode, slideIndex: mode === 'pinned' ? session.slideIndex : 0 };
}

export type StudentView =
  | { state: 'hold' }
  | { state: 'slide'; slideIndex: number; selfPaced: boolean };

/**
 * @param ownIndex where this device last navigated to; only used in `free` mode.
 */
export function resolveStudentView(session: Session, groupId: Id, slideCount: number, ownIndex: number): StudentView {
  const pacing = pacingOf(session, groupId);
  switch (pacing.mode) {
    case 'hold':
      return { state: 'hold' };
    case 'free':
      return { state: 'slide', slideIndex: clampIndex(ownIndex, slideCount), selfPaced: true };
    case 'pinned':
      return { state: 'slide', slideIndex: clampIndex(pacing.slideIndex, slideCount), selfPaced: false };
    case 'follow':
      return { state: 'slide', slideIndex: clampIndex(session.slideIndex, slideCount), selfPaced: false };
  }
}

/** The teacher's message as far as this group is concerned: addressed to it, or to everyone. */
export function messageFor(session: Session, groupId: Id): TeacherMessage | null {
  const message = session.message;
  return message && (message.groupId === null || message.groupId === groupId) ? message : null;
}
