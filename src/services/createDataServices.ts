import type { Caller } from '../ports/caller';
import type { DocumentStore } from '../ports/store';
import { AdmissionService } from './AdmissionService';
import { AnswerService } from './AnswerService';
import { ContentService } from './ContentService';
import { LessonService } from './LessonService';
import { ParticipantService } from './ParticipantService';
import { RecordService } from './RecordService';
import { RewardService } from './RewardService';
import { RosterService } from './RosterService';
import type { DataServices } from './Services';
import { SessionRosterService } from './SessionRosterService';
import { SessionService } from './SessionService';
import { TeacherService } from './TeacherService';

/** The one place the data services are wired together, for every place they run. */
export function createDataServices(store: DocumentStore, caller: Caller): DataServices {
  const sessionRoster = new SessionRosterService(store, caller);
  const roster = new RosterService(store, caller);
  const participants = new ParticipantService(store, caller, sessionRoster);
  const records = new RecordService(store, caller, sessionRoster, roster, participants);
  return {
    content: new ContentService(store, caller),
    roster,
    teachers: new TeacherService(store, caller),
    lessons: new LessonService(store, caller),
    sessions: new SessionService(store, caller, roster, sessionRoster, records),
    sessionRoster,
    participants,
    admission: new AdmissionService(store, caller, sessionRoster, sessionRoster),
    answers: new AnswerService(store, caller, participants, sessionRoster, sessionRoster),
    rewards: new RewardService(store, caller, participants, sessionRoster),
    records,
  };
}
