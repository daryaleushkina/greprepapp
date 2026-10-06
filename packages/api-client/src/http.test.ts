import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, configureHttp, http, isApiError, lastSeenRequestId } from './http';

const Thing = z.object({ id: z.string() });

function respond(status: number, body: string, headers: Record<string, string> = {}) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(status === 204 ? null : body, { status, headers }));
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  if (!isApiError(e)) throw new Error(`expected ApiError, got ${String(e)}`);
  return e;
}

beforeEach(() => configureHttp({ getToken: () => null, baseUrl: '' }));
afterEach(() => vi.unstubAllGlobals());

describe('http', () => {
  it('ответ по договору — данные, id запроса запоминается', async () => {
    const fetch = respond(200, '{"id":"a","extra":1}', { 'X-Request-Id': 'req-1' });
    vi.stubGlobal('fetch', fetch);
    // Лишнее поле в ответе не роняет: новый сервер может прислать то, чего старый клиент не знает.
    expect(await http('/api/thing', { schema: Thing })).toEqual({ id: 'a' });
    expect(lastSeenRequestId()).toBe('req-1');
    const init = fetch.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    expect(init?.credentials).toBe('same-origin');
  });

  it('токен мини-аппа — в Authorization; свой заголовок не перебивается', async () => {
    configureHttp({ getToken: () => 'tok', baseUrl: 'https://api.example' });
    const fetch = respond(200, '{"id":"a"}');
    vi.stubGlobal('fetch', fetch);
    await http('/api/thing', { schema: Thing });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.example/api/thing');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer tok');
    await http('/api/thing', { schema: Thing, headers: { Authorization: 'Bearer other' } });
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe('Bearer other');
  });

  it('204 и ответ без схемы — undefined', async () => {
    vi.stubGlobal('fetch', respond(204, ''));
    expect(await http('/api/auth/logout', { method: 'POST' })).toBeUndefined();
    vi.stubGlobal('fetch', respond(200, 'ignored'));
    expect(await http('/api/client-errors', { method: 'POST' })).toBeUndefined();
  });

  it('ошибка из договора — код и id запроса', async () => {
    vi.stubGlobal('fetch', respond(401, '{"code":"unauthorized","message":"no session","requestId":"r9"}'));
    const e = await failure(http('/api/me', { schema: Thing }));
    expect(e).toMatchObject({ kind: 'server', status: 401, code: 'unauthorized', requestId: 'r9' });
  });

  it('ошибка без тела договора: 502 от прокси — server/internal, 4xx — contract', async () => {
    vi.stubGlobal('fetch', respond(502, '<html>Bad gateway</html>', { 'X-Request-Id': 'proxy' }));
    expect(await failure(http('/api/today', { schema: Thing }))).toMatchObject({ kind: 'server', status: 502, code: 'internal', requestId: 'proxy' });
    vi.stubGlobal('fetch', respond(404, 'not found'));
    expect(await failure(http('/api/today', { schema: Thing }))).toMatchObject({ kind: 'contract', status: 404, code: 'bad_response' });
  });

  it('нет сети и оборванное тело — network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await failure(http('/api/today', { schema: Thing }))).toMatchObject({ kind: 'network', code: 'network' });
    vi.stubGlobal('fetch', respond(200, '{"id":'));
    expect(await failure(http('/api/today', { schema: Thing }))).toMatchObject({ kind: 'network', status: 200 });
    // Соединение оборвалось посреди тела.
    const broken = new ReadableStream({ start: (c) => c.error(new TypeError('reset')) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(broken, { status: 200 })),
    );
    expect(await failure(http('/api/today', { schema: Thing }))).toMatchObject({ kind: 'network', status: 200 });
  });

  it('ответ не по договору — contract', async () => {
    vi.stubGlobal('fetch', respond(200, '{"id":5}'));
    expect(await failure(http('/api/thing', { schema: Thing }))).toMatchObject({ kind: 'contract', status: 200 });
  });

  it('отменённый запрос пробрасывается как есть', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw abort;
      }),
    );
    await expect(http('/api/today', { schema: Thing })).rejects.toBe(abort);
  });
});
