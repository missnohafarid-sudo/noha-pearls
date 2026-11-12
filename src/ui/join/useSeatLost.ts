import { useEffect, useRef, useState } from 'react';
import { seatLoss, type SeatLoss } from '../../domain/admission';
import type { Id, Participant } from '../../domain/models';
import { useServices } from '../ServicesContext';

/**
 * Why this device lost the seat it had during this page's visit, or null while it has one or never had one: the
 * teacher removed it, or its name moved to another device. `leave` is the one way to give a seat up by her own
 * choice: it records the intent before the seat goes, so a snapshot that arrives late can never turn it into a notice.
 */
export function useSeatLost(seat: Participant | null | undefined): { lost: SeatLoss | null; leave: (sessionId: Id) => Promise<void> } {
  const { participants } = useServices();
  const [lastSeat, setLastSeat] = useState<Participant | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    if (seat === null) leaving.current = false;
    else if (seat && !leaving.current) setLastSeat(seat);
  }, [seat]);

  const leave = (sessionId: Id) => {
    leaving.current = true;
    setLastSeat(null);
    return participants.leave(sessionId);
  };
  return { lost: lastSeat !== null && seat === null ? seatLoss(lastSeat) : null, leave };
}
