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
import { createContext, use, useEffect, type ReactNode } from 'react';
import { reportError } from '../errors/report';
import { trainingRepository } from '../training/repository';
import type { TelegramLaunch } from '../telegram/sdk';

export const SESSION_KEY = ['session'] as const;

/** Токен мини-аппа — только в памяти вкладки (api/openapi.yaml, Session.token). */
let miniAppToken: string | null = null;
/** Номер токена: растёт при каждой смене, запросы помнят, под каким ушли (ApiError.authTag). */
let authTag = 0;
configureHttp({ getToken: () => miniAppToken, getAuthTag: () => authTag });

function setMiniAppToken(token: string | null): void {
  miniAppToken = token;
  authTag++;
}

export function currentAuthTag(): number {
  return authTag;
}

export type Session =
  | { status: 'loading' }
  | { status: 'signedIn'; user: User }
  /** expired — сессия была и кончилась (сервер ответил 401): на экране входа — «Вход закончился». */
  | { status: 'signedOut'; expired: boolean }
  | { status: 'error'; error: unknown; retry: () => void };

interface SessionApi {
  session: Session;
  /** Вошли на сайте (кнопкой или подменой): сервер уже поставил куку, здесь — кто вошёл. */
  signedIn: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

/** Данные запроса сессии: человек или null (не вошёл); expired — помечает, что сессия кончилась сама. */
type SessionData = { user: User | null; expired: boolean };

async function loadSession(launch: TelegramLaunch | null): Promise<SessionData> {
  if (launch) {
    const res = await signInWithTelegramMiniApp({ initData: launch.initDataRaw });
    // Вход по initData — всегда с токеном в теле (transport bearer); без него мини-апп не сможет ни одного запроса.
    if (!res.token) throw new ApiError('contract', { status: 200, message: 'telegram-mini-app sign-in returned no token' });
    setMiniAppToken(res.token);
    await trainingRepository.signedIn(res.user.id);
    return { user: res.user, expired: false };
  }
  try {
    const user = await getMe();
    await trainingRepository.signedIn(user.id);
    return { user, expired: false };
  } catch (e) {
    if (isApiError(e) && e.status === 401) { trainingRepository.pause(); return { user: null, expired: false }; }
    throw e;
  }
}

export function SessionProvider({ launch, children }: { launch: TelegramLaunch | null; children: ReactNode }): ReactNode {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => loadSession(launch),
    staleTime: Infinity,
  });

  // Ответ сервера не по договору при входе — ошибка у нас, а не у человека: в отчёт.
  const error = query.error;
  useEffect(() => {
    if (isApiError(error) && error.kind === 'contract') reportError(error);
  }, [error]);

  let session: Session;
  // Ошибка — раньше данных: мини-апп, который не смог войти заново, не должен показывать прошлую сессию.
  if (query.isError) {
    session = { status: 'error', error: query.error, retry: () => void query.refetch() };
  } else if (query.data) {
    session = query.data.user ? { status: 'signedIn', user: query.data.user } : { status: 'signedOut', expired: query.data.expired };
  } else {
    session = { status: 'loading' };
  }

  const api: SessionApi = {
    session,
    signedIn: async (user) => {
      // Запрос «кто вошёл», отправленный до входа (кука ещё не стояла), ответит «никто» позже — и затёр бы
      // только что открытую сессию. Сначала его отменяем, потом записываем вошедшего.
      await queryClient.cancelQueries({ queryKey: SESSION_KEY });
      await trainingRepository.signedIn(user.id);
      queryClient.setQueryData<SessionData>(SESSION_KEY, { user, expired: false });
    },
    signOut: async () => {
      try {
        await apiSignOut();
      } catch (e) {
        // 401 — сессии на сервере уже нет (вышли в другой вкладке, срок кончился): цель выхода достигнута, данные
        // с экрана всё равно стираем. Остальные отказы — экран как был: кука, может быть, ещё жива.
        if (!(isApiError(e) && e.status === 401)) throw e;
      }
      await trainingRepository.signOut();
      setMiniAppToken(null);
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
    // Запрос ушёл под старым токеном, а новый уже есть — его не трогаем.
    if (error.authTag !== undefined && error.authTag !== authTag) return;
    // Не чаще раза в 10 секунд: если сервер отвечает 401 и свежей сессии, заново не входим по кругу —
    // экран покажет ошибку как есть.
    const now = Date.now();
    if (now - lastReauthAt < REAUTH_EVERY_MS) return;
    lastReauthAt = now;
    trainingRepository.pause();
    setMiniAppToken(null);
    void queryClient.refetchQueries({ queryKey: SESSION_KEY }).then(() => {
      // Вошли заново — перечитать то, что упало на старой сессии; не вошли — экран входа скажет, а запросы без
      // токена слать незачем.
      if (queryClient.getQueryState(SESSION_KEY)?.status !== 'success') return;
      return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
    });
    return;
  }
  trainingRepository.pause();
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
