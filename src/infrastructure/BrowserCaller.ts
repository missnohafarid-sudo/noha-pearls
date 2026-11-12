import { newId } from '../domain/ids';
import type { Id } from '../domain/models';
import type { AuthGateway } from '../ports/auth';
import type { Caller } from '../ports/caller';
import type { KeyValueStorage } from '../ports/storage';

/**
 * The caller as this browser tab knows it: its sign-in flag and an id kept in the tab's memory,
 * so a refresh keeps the student's name.
 */
export class BrowserCaller implements Caller {
  constructor(
    private readonly admin: Pick<AuthGateway, 'isAdmin'>,
    private readonly deviceMemory: KeyValueStorage,
    private readonly deviceKey: string,
  ) {}

  isAdmin(): boolean {
    return this.admin.isAdmin();
  }

  deviceId(): Id {
    const existing = this.deviceMemory.getItem(this.deviceKey);
    if (existing) return existing;
    const created = newId();
    this.deviceMemory.setItem(this.deviceKey, created);
    return created;
  }
}
