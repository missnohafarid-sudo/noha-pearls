/** A plain request the hub answered with something other than success. `status` is the HTTP status. */
export class RequestRefused extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`The request to ${path} failed`);
    this.name = 'RequestRefused';
  }
}
