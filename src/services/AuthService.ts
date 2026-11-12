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

/** Guards admin commands in the other services. The single place every service asks "is this the admin?". */
export function requireAdmin(caller: Caller): void {
  if (!caller.isAdmin()) throw new NotAuthorizedError();
}
