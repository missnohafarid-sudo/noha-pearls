import type { Unsubscribe } from './store';

/** What an admin types: the password and the six-digit authenticator code. */
export interface AdminCredentials {
  password: string;
  code: string;
}

/**
 * Verifies the admin credentials and remembers the result for this device.
 * One boolean on purpose: a failed attempt must not reveal which part was wrong.
 */
export interface AuthGateway {
  signIn(credentials: AdminCredentials): Promise<boolean>;
  signOut(): Promise<void>;
  isAdmin(): boolean;
  subscribe(listener: () => void): Unsubscribe;
}
