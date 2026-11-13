import type { AdminCredentials, AuthGateway } from '../ports/auth';
import type { Caller } from '../ports/caller';
import type { Unsubscribe } from '../ports/store';

export class NotAuthorizedError extends Error {
  constructor() {
    super('Admin access required');
    this.name = 'NotAuthorizedError';
  }
}

/** The sign-in use case: the interface signs the admin in and out and follows the result. */
export class AuthService {
  constructor(private readonly gateway: AuthGateway) {}

  isAdmin(): boolean {
    return this.gateway.isAdmin();
  }

  signIn(credentials: AdminCredentials): Promise<boolean> {
    return this.gateway.signIn(credentials);
  }

  signOut(): Promise<void> {
    return this.gateway.signOut();
  }

  subscribe(listener: () => void): Unsubscribe {
    return this.gateway.subscribe(listener);
  }
}

/**
 * Opens a read only the admin may make. Throws for anyone else at once, and the moment the caller stops being the admin it stops
 * delivering and closes the source, so the check is made at every emission and not only when subscribing.
 */
export function adminWatch<T>(caller: Caller, listener: (value: T) => void, open: (emit: (value: T) => void) => Unsubscribe): Unsubscribe {
  requireAdmin(caller);
  let closed = false;
  let stop: Unsubscribe | null = null;
  const close = () => {
    closed = true;
    stop?.();
  };
  stop = open((value) => {
    if (closed) return;
    if (caller.isAdmin()) listener(value);
    else close();
  });
  if (closed) stop();
  return close;
}

/** Guards admin commands in the other services. The single place every service asks "is this the admin?". */
export function requireAdmin(caller: Caller): void {
  if (!caller.isAdmin()) throw new NotAuthorizedError();
}
