import type { CardResults, BoardTotal, NameClaims, SeenRoster } from '../../domain/visibility';
import { useServices } from '../ServicesContext';
import { useAdminLive } from './data';
import { useLive } from './useLive';

/** What the pages read about a class by its code: the public reads, which open only the class the code opens for this device. */
type MaybeCode = string | null | undefined;

/** The groups and students a device picks from: no roll, no card numbers. */
export function useSeenRoster(code: MaybeCode): SeenRoster | undefined {
  const { sessionRoster } = useServices();
  return useLive(code ? (listener) => sessionRoster.watchSeen(code, listener) : null, [sessionRoster, code]);
}

/** The group totals of the class: score, pearls' basis and hearts, for the board. */
export function useBoardTotals(code: MaybeCode): BoardTotal[] | undefined {
  const { board } = useServices();
  return useLive(code ? (listener) => board.watchTotals(code, listener) : null, [board, code]);
}

/** The results of the student who holds this card; null while no student of the class does. */
export function useCardResults(code: MaybeCode, cardNumber: number | null): CardResults | null | undefined {
  const { board } = useServices();
  return useLive(code && cardNumber !== null ? (listener) => board.watchCardResults(code, cardNumber, listener) : null, [board, code, cardNumber]);
}

/** How many hearts the class has been given. */
export function useHeartCount(code: MaybeCode): number | undefined {
  const { rewards } = useServices();
  return useLive(code ? (listener) => rewards.watchHeartCount(code, listener) : null, [rewards, code]);
}

/** The names other devices hold, and this device's request number when its own name is contested. */
export function useNameClaims(code: MaybeCode): NameClaims | undefined {
  const { participants } = useServices();
  return useLive(code ? (listener) => participants.watchNameClaims(code, listener) : null, [participants, code]);
}

/** How many ended classes of the class list of the class this code opens have been kept; changes the moment one more is. */
export function useKeptRecordCount(code: MaybeCode): number | undefined {
  const { records } = useServices();
  return useLive(code ? (listener) => records.watchKeptCount(code, listener) : null, [records, code]);
}

/** The same count for a class list, for the teacher's page of results. */
export function useClassKeptCount(classId: MaybeCode): number | undefined {
  const { records } = useServices();
  return useAdminLive(classId ? (listener) => records.watchClassKeptCount(classId, listener) : null, [records, classId]);
}
