import type { Unsubscribe } from './store';

/** What an admin types: the password and the six-digit authenticator code. */
export interface AdminCredentials {
  password: string;
  code: string;
}

/** How a sign-in ended: 'closed' when sign-in is shut for everyone for a while; a failure never says which part was wrong. */
export type SignInResult = 'signed-in' | 'wrong' | 'closed';

/** Verifies the admin credentials and remembers the result for this device. */
export interface AuthGateway {
  signIn(credentials: AdminCredentials): Promise<SignInResult>;
  signOut(): Promise<void>;
  isAdmin(): boolean;
  subscribe(listener: () => void): Unsubscribe;
}
