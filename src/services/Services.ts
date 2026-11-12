import type { MarkerDetector, MarkerRenderer, QrRenderer } from '../ports/codes';
import type { AdmissionService } from './AdmissionService';
import type { AnswerService } from './AnswerService';
import type { AuthService } from './AuthService';
import type { ContentService } from './ContentService';
import type { LessonService } from './LessonService';
import type { ParticipantService } from './ParticipantService';
import type { RecordService } from './RecordService';
import type { RewardService } from './RewardService';
import type { RosterService } from './RosterService';
import type { SessionRosterService } from './SessionRosterService';
import type { SessionService } from './SessionService';
import type { TeacherService } from './TeacherService';

export type CardCodec = MarkerDetector & MarkerRenderer;

/** Everything the interface may ask of the application. The composition root builds one. */
export interface Services {
  auth: AuthService;
  content: ContentService;
  roster: RosterService;
  teachers: TeacherService;
  lessons: LessonService;
  sessions: SessionService;
  sessionRoster: SessionRosterService;
  participants: ParticipantService;
  admission: AdmissionService;
  answers: AnswerService;
  rewards: RewardService;
  records: RecordService;
  qr: QrRenderer;
  /** Loaded on demand: only the teacher's scanner and the card printer need it. */
  loadCardCodec(): Promise<CardCodec>;
}
