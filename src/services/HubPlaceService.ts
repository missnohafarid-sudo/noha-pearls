import type { HubPlace } from '../ports/hubPlace';

/** Where the hub runs. Anyone may ask: it says nothing about the school or anyone in it. */
export class HubPlaceService {
  constructor(private readonly place: HubPlace) {}

  code(): Promise<string | null> {
    return this.place.code();
  }
}
