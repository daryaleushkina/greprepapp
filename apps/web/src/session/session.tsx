// Сессия: кто вошёл. Мини-апп входит сам, по initData (ноль экранов на входе, PRODUCT.md «Operating Context»),
// токен держит в памяти — после перезапуска мини-апп снова входит по свежей initData. Сайт ходит с кукой
// __Host-session (HttpOnly — скрипту её не видно) и узнаёт, кто вошёл, у /api/me.
import {
  ApiError,
  configureHttp,
  getMe,
  isApiError,
  signInWithTelegramMiniApp,
  signOut as apiSignOut,
  type User,
} from '@greprep/api-client';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, use, type ReactNode } from 'react';
import type { TelegramLaunch } from '../telegram/sdk';

export const SESSION_KEY = ['session'] as const;

/** Токен мини-аппа — только в памяти вкладки (api/openapi.yaml, Session.token). */
let miniAppToken: string | null = null;
configureHttp({ getToken: () => miniAppToken });

export type Session =
  | { status: 'loading' }
  | { status: 'signedIn'; user: User }
  /** expired — сессия была и кончилась (сервер ответил 401): на экране входа — «Вход закончился». */
  | { status: 'signedOut'; expired: boolean }
  | { status: 'error'; error: unknown; retry: () => void };

interface SessionApi {
  session: Session;
  /** Вошли на сайте (кнопкой или подменой): сервер уже поставил куку, здесь — кто вошёл. */
  signedIn: (user: User) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

/** Данные запроса сессии: человек или null (не вошёл); expired — помечает, что сессия кончилась сама. */
type SessionData = { user: User | null; expired: boolean };

async function loadSession(launch: TelegramLaunch | null): Promise<SessionData> {
  if (launch) {
    const res = await signInWithTelegramMiniApp({ initData: launch.initDataRaw });
    miniAppToken = res.token ?? null;
    return { user: res.user, expired: false };
  }
  try {
    return { user: await getMe(), expired: false };
  } catch (e) {
    if (isApiError(e) && e.status === 401) return { user: null, expired: false };
    throw e;
  }
}

export function SessionProvider({ launch, children }: { launch: TelegramLaunch | null; children: ReactNode }): ReactNode {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => loadSession(launch),
    staleTime: Infinity,
    // Нет сети при входе — пробуем ещё; отказ сервера (неверная initData) повтором не лечится.
    retry: (count, e) => isApiError(e) && e.kind === 'network' && count < 3,
  });

  let session: Session;
  if (query.data) {
    session = query.data.user ? { status: 'signedIn', user: query.data.user } : { status: 'signedOut', expired: query.data.expired };
  } else if (query.isError) {
    session = { status: 'error', error: query.error, retry: () => void query.refetch() };
  } else {
    session = { status: 'loading' };
  }

  const api: SessionApi = {
    session,
    signedIn: (user) => queryClient.setQueryData<SessionData>(SESSION_KEY, { user, expired: false }),
    signOut: async () => {
      await apiSignOut();
      miniAppToken = null;
      forgetUserData(queryClient, false);
    },
  };
  return <SessionContext value={api}>{children}</SessionContext>;
}

export function useSession(): SessionApi {
  const api = use(SessionContext);
  if (!api) throw new Error('useSession outside SessionProvider');
  return api;
}

/**
 * Сессия кончилась посреди работы (сервер ответил 401 на запрос данных). Сайт — на вход с «Вход закончился»;
 * мини-апп — входит заново по initData (её срок — сутки; дальше Telegram даст свежую при следующем запуске).
 */
export function onUnauthorized(queryClient: QueryClient, error: unknown, isMiniApp: boolean): void {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  if (isMiniApp) {
    // Не чаще раза в 10 секунд: если сервер отвечает 401 и свежей сессии, заново не входим по кругу —
    // экран покажет ошибку как есть.
    const now = Date.now();
    if (now - lastReauthAt < REAUTH_EVERY_MS) return;
    lastReauthAt = now;
    miniAppToken = null;
    void queryClient
      .refetchQueries({ queryKey: SESSION_KEY })
      // Вошли заново — перечитать то, что упало на старой сессии.
      .then(() => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] }));
    return;
  }
  forgetUserData(queryClient, true);
}

const REAUTH_EVERY_MS = 10_000;
let lastReauthAt = 0;

/** Для тестов: каждый тест — свежий запуск мини-аппа. */
export function resetReauthForTests(): void {
  lastReauthAt = 0;
}

/** Чужие данные в кэше после выхода не остаются: следующий, кто войдёт на этом компьютере, их не увидит. */
function forgetUserData(queryClient: QueryClient, expired: boolean): void {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
  queryClient.setQueryData<SessionData>(SESSION_KEY, { user: null, expired });
}
