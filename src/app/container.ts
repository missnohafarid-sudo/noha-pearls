import { BrowserCaller } from '../infrastructure/BrowserCaller';
import { PrototypeAuthGateway } from '../infrastructure/PrototypeAuthGateway';
import { LocalDocumentStore, StorageEventChangeBus } from '../infrastructure/LocalDocumentStore';
import { QrSvgRenderer } from '../infrastructure/QrSvgRenderer';
import { browserStorage } from '../infrastructure/storage';
import { AuthService } from '../services/AuthService';
import { createDataServices } from '../services/createDataServices';
import type { CardCodec, Services } from '../services/Services';
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
  const gateway = new PrototypeAuthGateway(
    { passwordSha256: ADMIN_PASSWORD_SHA256, totpSecret: ADMIN_TOTP_SECRET },
    tabMemory,
    `${STORAGE_NAMESPACE}/admin`,
  );
  const auth = new AuthService(gateway);
  const caller = new BrowserCaller(gateway, tabMemory, `${STORAGE_NAMESPACE}/device`);
  let cardCodec: Promise<CardCodec> | null = null;

  return {
    ...createDataServices(store, caller),
    auth,
    qr: new QrSvgRenderer(),
    loadCardCodec: () =>
      (cardCodec ??= import('../infrastructure/ArucoCardCodec').then((module) => new module.ArucoCardCodec())),
  };
}
