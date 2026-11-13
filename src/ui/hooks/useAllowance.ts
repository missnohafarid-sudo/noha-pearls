import type { DayLevel } from '../../domain/abuse';
import { useServices } from '../ServicesContext';
import { useAdmin } from './data';
import { useLive } from './useLive';

/** How much of the day's saving allowance is used. Only the teacher is told; for anyone else it stays `undefined`. */
export function useAllowanceLevel(): DayLevel | undefined {
  const { allowance } = useServices();
  const admin = useAdmin();
  return useLive(admin ? (listener) => allowance.watchLevel(listener) : null, [allowance, admin]);
}
