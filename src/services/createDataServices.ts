import type { Caller } from '../ports/caller';
import type { DocumentStore } from '../ports/store';
import { AllowanceService } from './AllowanceService';
import { AdmissionService } from './AdmissionService';
import { AnswerService } from './AnswerService';
import { BoardService } from './BoardService';
import { ClassLookupService } from './ClassLookupService';
import { ContentService } from './ContentService';
import { FolderService } from './FolderService';
import { LessonService } from './LessonService';
import { ParticipantService } from './ParticipantService';
import { RecordService } from './RecordService';
import { RetentionService } from './RetentionService';
import { RewardService } from './RewardService';
import { RosterService } from './RosterService';
import { SeatViewService } from './SeatViewService';
import type { ServiceClasses } from './Services';
import { SessionRosterService } from './SessionRosterService';
import { SessionService } from './SessionService';
import { TeacherService } from './TeacherService';
import { unlimitedRuntime, type ServiceRuntime } from './runtime';

/** The one place the data services are wired together, for every place they run. */
export function createDataServices(store: DocumentStore, caller: Caller, runtime: ServiceRuntime = unlimitedRuntime()): ServiceClasses {
  const sessionRoster = new SessionRosterService(store, caller);
  const roster = new RosterService(store, caller);
  const participants = new ParticipantService(store, caller, sessionRoster);
  const records = new RecordService(store, caller, sessionRoster, roster, participants);
  const lessons = new LessonService(store, caller);
  return {
    content: new ContentService(store, caller),
    roster,
    teachers: new TeacherService(store, caller),
    folders: new FolderService(store, caller, lessons),
    lessons,
    sessions: new SessionService(store, caller, roster, sessionRoster, records),
    allowance: new AllowanceService(caller, runtime.allowance),
    classLookup: new ClassLookupService(store, participants, sessionRoster),
    sessionRoster,
    participants,
    admission: new AdmissionService(store, caller, sessionRoster, sessionRoster),
    answers: new AnswerService(store, caller, participants, sessionRoster, sessionRoster),
    rewards: new RewardService(store, caller, participants, sessionRoster),
    records,
    retention: new RetentionService(store, caller),
    board: new BoardService(store),
    seatView: new SeatViewService(store, participants),
  };
}
