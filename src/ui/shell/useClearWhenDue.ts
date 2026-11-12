import { useEffect } from 'react';
import { useAdmin } from '../hooks/data';
import { useServices } from '../ServicesContext';

/** Lets the signed-in admin's page clear the students' data when the school year has ended: once when the page loads and once when she signs in. */
export function useClearWhenDue(): void {
  const { retention } = useServices();
  const admin = useAdmin();
  useEffect(() => {
    // A failed clearing writes nothing down, so the next page load repeats it; there is nothing she could do about it meanwhile.
    if (admin) retention.clearIfDue().catch(() => undefined);
  }, [retention, admin]);
}
