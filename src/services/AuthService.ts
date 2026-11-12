import type { AdminCredentials, AuthGateway } from '../ports/auth';
import type { Unsubscribe } from '../ports/store';

export class NotAuthorizedError extends Error {
  constructor() {
    super('Admin access required');
    this.name = 'NotAuthorizedError';
  }
}

/** The single place every layer asks "is this the admin?". */
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

  /** Guards admin commands in the other services. The backend enforces the same rule on the data. */
  requireAdmin(): void {
    if (!this.isAdmin()) throw new NotAuthorizedError();
  }
}
