import { LIVE_PATH } from '../../ports/wire';
import type { SocketFactory, Timers } from './LiveConnection';
import { RequestRefused } from './RequestRefused';
import type { PostJson } from './RemoteSession';

/** The browser's own pieces under the remote adapters: the socket, the timers and the plain request. */

export const openBrowserSocket: SocketFactory = ({ message, closed }) => {
  const url = new URL(LIVE_PATH, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  socket.onmessage = (event) => {
    if (typeof event.data === 'string') message(event.data);
  };
  socket.onclose = (event) => closed(event.code);
  return { send: (text) => socket.send(text), close: () => socket.close() };
};

export const browserTimers: Timers = {
  after: (ms, work) => {
    const handle = window.setTimeout(work, ms);
    return () => window.clearTimeout(handle);
  },
  every: (ms, work) => {
    const handle = window.setInterval(work, ms);
    return () => window.clearInterval(handle);
  },
  random: () => Math.random(),
};

/** A POST with a JSON body to this site's API, with the cookies that belong to it; the answer's JSON. */
export const postJson: PostJson = async (path, body) => {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new RequestRefused(path, response.status);
  return response.json();
};
