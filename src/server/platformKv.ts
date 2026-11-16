/** What the hub's helpers use of the platform's own key-value store, which sits beside the hub's tables but is never one of them. */
export interface PlatformKv {
  get<T>(key: string): T | undefined;
  put<T>(key: string, value: T): void;
}
