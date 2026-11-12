import { PrototypeAuthGateway } from '../infrastructure/PrototypeAuthGateway';
import { LocalDocumentStore, StorageEventChangeBus } from '../infrastructure/LocalDocumentStore';
import { QrSvgRenderer } from '../infrastructure/QrSvgRenderer';
import { browserStorage } from '../infrastructure/storage';
import { AdmissionService } from '../services/AdmissionService';
import { AnswerService } from '../services/AnswerService';
import { AuthService } from '../services/AuthService';
import { ContentService } from '../services/ContentService';
import { LessonService } from '../services/LessonService';
import { ParticipantService } from '../services/ParticipantService';
import { RecordService } from '../services/RecordService';
import { RewardService } from '../services/RewardService';
import { RosterService } from '../services/RosterService';
import type { CardCodec, Services } from '../services/Services';
import { SessionRosterService } from '../services/SessionRosterService';
import { SessionService } from '../services/SessionService';
import { TeacherService } from '../services/TeacherService';
import sampleLesson from '../i18n/sampleLesson.json';
import { ADMIN_PASSWORD_SHA256, ADMIN_TOTP_SECRET, STORAGE_NAMESPACE } from './config';
import { seedIfEmpty } from './seed';

/**
 * Composition root: the only place that names concrete adapters.
 * Moving to a hosted backend means swapping the store and the auth gateway here.
 */
export async function createServices(): Promise<Services> {
  const store = new LocalDocumentStore(
    browserStorage(localStorage),
    new StorageEventChangeBus(STORAGE_NAMESPACE, window),
    STORAGE_NAMESPACE,
  );
  await seedIfEmpty(store, sampleLesson);

  // Per-tab memory, so each browser tab behaves as a separate classroom device.
  const tabMemory = browserStorage(sessionStorage);
  const auth = new AuthService(new PrototypeAuthGateway(
      { passwordSha256: ADMIN_PASSWORD_SHA256, totpSecret: ADMIN_TOTP_SECRET },
      tabMemory,
      `${STORAGE_NAMESPACE}/admin`,
    ),);

  const sessionRoster = new SessionRosterService(store, auth);
  const roster = new RosterService(store, auth);
  const participants = new ParticipantService(store, tabMemory, `${STORAGE_NAMESPACE}/device`, sessionRoster);
  const records = new RecordService(store, auth, sessionRoster, roster, participants);
  let cardCodec: Promise<CardCodec> | null = null;

  return {
    auth,
    content: new ContentService(store, auth),
    roster,
    teachers: new TeacherService(store, auth),
    lessons: new LessonService(store, auth),
    sessions: new SessionService(store, auth, roster, sessionRoster, records),
    sessionRoster,
    participants,
    admission: new AdmissionService(store, auth, sessionRoster, sessionRoster),
    answers: new AnswerService(store, auth, participants, sessionRoster, sessionRoster),
    rewards: new RewardService(store, auth, participants, sessionRoster),
    records,
    qr: new QrSvgRenderer(),
    loadCardCodec: () =>
      (cardCodec ??= import('../infrastructure/ArucoCardCodec').then((module) => new module.ArucoCardCodec())),
  };
}
