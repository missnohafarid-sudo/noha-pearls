import type { Id, Session } from '../../domain/models';
import { openedParts } from '../../domain/sessions';
import { useServices } from '../ServicesContext';
import type { HiddenControl } from '../slides/hiddenControl';

/** The teacher's control over a slide's hidden parts in this class: a part is open for everyone when the class has it open, and pressing it opens or closes it for everyone. */
export function useSharedHiddenParts(session: Session): (slideId: Id) => HiddenControl {
  const { sessions } = useServices();
  return (slideId) => {
    const isOpen = (key: string) => openedParts(session, slideId).includes(key);
    return { isOpen, toggle: (key) => void sessions.setHiddenOpen(session.id, slideId, key, !isOpen(key)) };
  };
}
