// Вход на сайте через Telegram, Apple и Google: OpenID Connect, код авторизации с PKCE. Сайт уводит человека на
// страницу провайдера, тот возвращает его на /auth/callback с кодом, а код на id_token меняет сервер — секрет
// клиента в браузер не попадает (api/openapi.yaml, /api/auth/oidc/code). Так же устроено окно входа в приложении
// Apple (apps/apple, WebSignIn.swift).
import { z } from 'zod';
import type { Provider, ProviderConfig } from '../config';
import { codeChallenge, randomToken } from './pkce';
import { safeReturnTo } from './returnTo';

/** Что помнит вкладка между уходом к провайдеру и возвратом. */
export interface Attempt {
  provider: Provider;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  startedAt: number;
  returnTo: string;
}

export const CALLBACK_PATH = '/auth/callback';
const STORAGE_KEY = 'greprep.signIn';
/** Сколько ждём возврата от провайдера: дольше — попытка устарела, начинать заново. */
const ATTEMPT_TTL_MS = 10 * 60 * 1000;

/** Хранилище попытки — sessionStorage вкладки (подменяется в тестах). */
export interface AttemptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Запоминает попытку и возвращает адрес страницы входа провайдера.
 * У Apple на сайте без scope: с name/email Apple требует response_mode=form_post (POST на наш адрес), а сайт —
 * статика. Имя у Apple сайт не получит — сервер назовёт аккаунт сам.
 */
export async function beginSignIn(provider: Provider, config: ProviderConfig, origin: string, storage: AttemptStorage, now = Date.now(), returnTo: unknown = '/'): Promise<string> {
  const attempt: Attempt = {
    provider,
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: randomToken(),
    redirectUri: origin + CALLBACK_PATH,
    startedAt: now,
    returnTo: safeReturnTo(returnTo),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(attempt));
  const url = new URL(config.authorizationEndpoint);
  const params = url.searchParams;
  params.set('response_type', 'code');
  params.set('client_id', config.clientId);
  params.set('redirect_uri', attempt.redirectUri);
  if (provider !== 'apple') params.set('scope', 'openid profile');
  params.set('state', attempt.state);
  params.set('nonce', attempt.nonce);
  params.set('code_challenge', await codeChallenge(attempt.codeVerifier));
  params.set('code_challenge_method', 'S256');
  return url.toString();
}

export type Callback = { ok: true; attempt: Attempt; code: string } | { ok: false; reason: 'cancelled' | 'invalid'; returnTo?: string };

/**
 * Разбирает возврат от провайдера. Попытка одноразовая: читается и сразу стирается, чтобы тот же адрес
 * (назад в истории, перезагрузка) не входил второй раз. state обязан совпасть — иначе это ответ на чужой
 * запрос (подмена входа).
 */
export function finishSignIn(search: URLSearchParams, storage: AttemptStorage, now = Date.now()): Callback {
  const raw = storage.getItem(STORAGE_KEY);
  storage.removeItem(STORAGE_KEY);
  const attempt = parseAttempt(raw);
  if (!attempt || search.get('state') !== attempt.state || now - attempt.startedAt > ATTEMPT_TTL_MS) {
    return { ok: false, reason: 'invalid' };
  }
  const error = search.get('error');
  if (error) return { ok: false, reason: error === 'access_denied' ? 'cancelled' : 'invalid', returnTo: attempt.returnTo };
  const code = search.get('code');
  if (!code) return { ok: false, reason: 'invalid' };
  return { ok: true, attempt, code };
}

/** Попытка из хранилища — внешние данные: проверяется по схеме, а не «как Attempt». */
const AttemptSchema = z.object({
  provider: z.enum(['telegram', 'apple', 'google']),
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(43),
  redirectUri: z.string().min(1),
  startedAt: z.number(),
  returnTo: z.unknown().optional().transform(safeReturnTo),
});

function parseAttempt(raw: string | null): Attempt | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = AttemptSchema.safeParse(v);
  return parsed.success ? parsed.data : null;
}
