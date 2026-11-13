import { NO_GUARD, type AbuseGuard } from '../ports/abuse';
import type { Caller } from '../ports/caller';
import type { DocumentStore } from '../ports/store';
import { BoardService } from './BoardService';
import { ClassCodes } from './ClassCodes';
import { ParticipantService } from './ParticipantService';
import { RecordService } from './RecordService';
import { RewardService } from './RewardService';
import { SessionRosterService } from './SessionRosterService';
import { StandingsCache } from './StandingsCache';
import type { ClassRosterSource } from './ClassRosterSource';
import type { SessionRosterSource } from './SessionRosterSource';

/** The services that need a class resolver, built with one the way `createDataServices` builds them, for tests that wire the pieces by hand. */
export const codesFor = (store: DocumentStore, caller: Caller, guard: AbuseGuard = NO_GUARD): ClassCodes => new ClassCodes(store, caller, guard);
export const rostersFor = (store: DocumentStore, caller: Caller): SessionRosterService => new SessionRosterService(store, caller, codesFor(store, caller));
export const participantsFor = (store: DocumentStore, caller: Caller, rosters: SessionRosterSource, guard: AbuseGuard = NO_GUARD): ParticipantService =>
  new ParticipantService(store, caller, rosters, codesFor(store, caller, guard), guard);
export const rewardsFor = (store: DocumentStore, caller: Caller, seats: ParticipantService, rosters: SessionRosterService): RewardService =>
  new RewardService(store, caller, seats, rosters, codesFor(store, caller));
export const recordsFor = (store: DocumentStore, caller: Caller, rosters: SessionRosterService, classes: ClassRosterSource, seats: ParticipantService): RecordService =>
  new RecordService(store, caller, rosters, classes, seats, codesFor(store, caller), new StandingsCache());
export const boardFor = (store: DocumentStore, caller: Caller, guard: AbuseGuard = NO_GUARD): BoardService => new BoardService(store, codesFor(store, caller, guard), guard);
