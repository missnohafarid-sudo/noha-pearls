import { BrowserCaller } from '../infrastructure/BrowserCaller';
import { PrototypeAuthGateway } from '../infrastructure/PrototypeAuthGateway';
import { LocalDocumentStore, StorageEventChangeBus } from '../infrastructure/LocalDocumentStore';
import { QrSvgRenderer } from '../infrastructure/QrSvgRenderer';
import { browserTimers, openBrowserSocket, postJson } from '../infrastructure/remote/browserTransport';
import { LiveConnection } from '../infrastructure/remote/LiveConnection';
import { RemoteSession } from '../infrastructure/remote/RemoteSession';
import { browserStorage } from '../infrastructure/storage';
import type { ConnectionStatus } from '../ports/remote';
import { AuthService } from '../services/AuthService';
import { createDataServices } from '../services/createDataServices';
import { createRemoteServices } from '../services/remoteServices';
import { seedIfEmpty } from '../services/seed';
import type { CardCodec, Services } from '../services/Services';
import { ADMIN_PASSWORD_SHA256, ADMIN_TOTP_SECRET, SITE_ONLY, STORAGE_NAMESPACE } from './config';

/**
 * Composition root: the only place that names concrete adapters.
 * The page either asks the hub, which holds the data and every secret, or (the walkthrough's build) keeps everything in the browser.
 */
export function createServices(): Promise<Services> {
  return SITE_ONLY ? createBrowserOnlyServices() : createHubServices();
}

/** What every mode gives the page that has nothing to do with data. */
function pageParts(): Pick<Services, 'qr' | 'loadCardCodec'> {
  let cardCodec: Promise<CardCodec> | null = null;
  return {
    qr: new QrSvgRenderer(),
    loadCardCodec: () => (cardCodec ??= import('../infrastructure/ArucoCardCodec').then((module) => new module.ArucoCardCodec())),
  };
}

async function createHubServices(): Promise<Services> {
  const session = new RemoteSession(postJson, () => connection.restart());
  const connection = new LiveConnection({ openSocket: openBrowserSocket, prepare: () => session.hello(), onHello: (hello) => session.learn(hello), timers: browserTimers });
  await connection.restart();
  const data = createRemoteServices(connection, () => session.now());
  return { ...data, auth: new AuthService(session), connection, ...pageParts() };
}

const ALWAYS_UP: ConnectionStatus = { isUp: () => true, turnedAway: () => null, subscribe: () => () => undefined };

async function createBrowserOnlyServices(): Promise<Services> {
  const store = new LocalDocumentStore(
    browserStorage(localStorage),
    new StorageEventChangeBus(STORAGE_NAMESPACE, window),
    STORAGE_NAMESPACE,
  );
  await seedIfEmpty(store);

  // Per-tab memory, so each browser tab behaves as a separate classroom device.
  const tabMemory = browserStorage(sessionStorage);
  const gateway = new PrototypeAuthGateway(
    { passwordSha256: ADMIN_PASSWORD_SHA256, totpSecret: ADMIN_TOTP_SECRET },
    tabMemory,
    `${STORAGE_NAMESPACE}/admin`,
  );
  const auth = new AuthService(gateway);
  const caller = new BrowserCaller(gateway, tabMemory, `${STORAGE_NAMESPACE}/device`);

  const dataServices = createDataServices(store, caller);
  // A failed clearing writes nothing down, so the next page load repeats it; there is nothing the admin could do about it meanwhile.
  const clearWhenDue = () => {
    if (caller.isAdmin()) dataServices.retention.clearIfDue().catch(() => undefined);
  };
  clearWhenDue();
  auth.subscribe(clearWhenDue);

  return { ...dataServices, auth, connection: ALWAYS_UP, ...pageParts() };
}
