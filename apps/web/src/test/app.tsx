// Приложение целиком для тестов компонентов: настоящие маршруты, сессия, кэш и клиент API, а сервер подменён
// (fetch по таблице «метод путь → ответ»). Ответы — по договору: их проверяет та же схема Zod, что в бою.
import type { Today, TodayStep, User } from '@greprep/api-client';
import { createMemoryHistory } from '@tanstack/react-router';
import { vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { App } from '../App';
import { makeQueryClient } from '../queryClient';
import { makeRouter } from '../router';
import type { Shell } from '../shell';
import { setTelegramRuntime } from '../telegram/runtime';
import type { TelegramLaunch } from '../telegram/sdk';

export type Handler = (req: Request) => Response | Promise<Response>;

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const apiError = (status: number, code: string) => json({ code, message: code, requestId: `req-${code}` }, status);

export const user = (over: Partial<User> = {}): User => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Даша',
  role: 'user',
  locale: 'ru',
  identities: [{ provider: 'telegram', linkedAt: '2026-10-06T10:00:00Z' }],
  ...over,
});

export const step = (id: string, state: TodayStep['state'], section: TodayStep['section'], minutes = 10): TodayStep => ({
  id,
  section,
  title: `Шаг ${id}`,
  minutes,
  state,
});

export const plan = (steps: TodayStep[]): Today => ({ date: '2026-10-06', steps });

export const STARTER = plan([step('words', 'current', 'words', 5), step('verbal', 'next', 'verbal'), step('quant', 'next', 'quant')]);

/** Подменный сервер: запросы, которые пришли, и ответы по таблице; чего нет в таблице — 404 из договора. */
export function fakeServer(handlers: Record<string, Handler>) {
  const requests: Request[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(new URL(String(input), location.origin), init);
    requests.push(req.clone());
    const handler = handlers[`${req.method} ${new URL(req.url).pathname}`];
    return handler ? handler(req) : apiError(404, 'not_found');
  });
  vi.stubGlobal('fetch', fetch);
  return { requests, fetch };
}

export async function renderApp(opts: { path: string; shell?: Shell; launch?: TelegramLaunch | null }) {
  const shell = opts.shell ?? 'site';
  setTelegramRuntime(shell === 'telegram' ? await import('@tma.js/sdk-react') : null);
  const queryClient = makeQueryClient(shell);
  // Повторы при нехватке сети — без пауз между попытками: правило то же, тест не ждёт секунды.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retryDelay: 0 } });
  const router = makeRouter({ queryClient, shell }, createMemoryHistory({ initialEntries: [opts.path] }));
  const screen = await render(<App queryClient={queryClient} router={router} shell={shell} launch={opts.launch ?? null} />);
  return { screen, router, queryClient };
}
