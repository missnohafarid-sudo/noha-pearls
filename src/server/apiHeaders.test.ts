import { describe, expect, it } from 'vitest';
import { withApiHeaders } from './apiHeaders';
import { answerApi, answerWithoutHub } from './gateway';

const carries = (response: Response): void => {
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
};

describe('the headers on what the server itself answers', () => {
  it('are on a success, an error and a not-found, and keep the status, the body and the other headers', async () => {
    for (const status of [200, 400, 403, 404, 405, 429, 500]) {
      const made = withApiHeaders(new Response(`body ${status}`, { status, headers: { 'Set-Cookie': 'a=b', Allow: 'GET', 'Cache-Control': 'max-age=999' } }));
      carries(made);
      expect(made.status).toBe(status);
      expect(await made.text()).toBe(`body ${status}`);
      expect(made.headers.get('Set-Cookie')).toBe('a=b');
      expect(made.headers.get('Allow')).toBe('GET');
    }
  });

  it('are on what the Worker answers without the hub', () => {
    carries(withApiHeaders(answerWithoutHub(new Request('https://school.example/api/health'))!));
    carries(withApiHeaders(answerWithoutHub(new Request('https://school.example/api/nothing'))!));
  });

  it('are not put on the socket upgrade, which must stay as it is', () => {
    const upgrade = { status: 101, headers: new Headers() } as unknown as Response;
    expect(withApiHeaders(upgrade)).toBe(upgrade);
  });

  it('are on a bare 500 when the hub throws or cannot be reached, and the error is reported', async () => {
    const reported: unknown[] = [];
    const broken = new Error('the hub is gone');
    for (const toHub of [() => Promise.reject(broken), () => { throw broken; }]) {
      const answer = await answerApi(new Request('https://school.example/api/hello', { method: 'POST' }), toHub, (error) => reported.push(error));
      carries(answer);
      expect(answer.status).toBe(500);
      expect(await answer.text()).toBe('');
    }
    expect(reported).toEqual([broken, broken]);
  });

  it('are on what the hub answers, and the hub is not asked for what the Worker answers alone', async () => {
    let asked = 0;
    const toHub = async () => (asked += 1, new Response('from the hub', { status: 200 }));
    carries(await answerApi(new Request('https://school.example/api/hello', { method: 'POST' }), toHub, () => undefined));
    await answerApi(new Request('https://school.example/api/health'), toHub, () => undefined);
    expect(asked).toBe(1);
  });
});
