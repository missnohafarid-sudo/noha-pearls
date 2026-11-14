/** What this device remembers of the site's look between page loads: a look's name, kept only here. */
export interface LookMemory {
  recall(): string | null;
  remember(look: string): void;
}
