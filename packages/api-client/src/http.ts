// Свой fetch для сгенерированного клиента (orval.config.ts, mutator): один на все запросы веба и админки.
//
// Что он гарантирует экранам:
//   • ответ проверен по схеме договора (Zod) — в экран не попадёт то, чего договор не обещал;
//   • любая неудача — ApiError с понятным видом: нет сети, сервер ответил кодом из договора, ответ не по
//     договору. Экран показывает текст по виду и коду, а не message сервера (api/openapi.yaml, Error);
//   • id запроса (X-Request-Id) последнего ответа запоминается — его кладёт отчёт об ошибке клиента;
//   • токен мини-аппа добавляется сам (configureHttp), сайт ходит с кукой — она уходит сама.
import { Error as ErrorSchema } from './generated/model/index.zod';

/** Схема ответа, которую передаёт сгенерированный код (includeZodSchemaInArguments). */
interface ResponseSchema {
  safeParse(data: unknown): { success: true; data: unknown } | { success: false; error: { message: string } };
}

export type ApiErrorKind =
  /** До сервера не дошли или ответ оборвался: «Нет сети». */
  | 'network'
  /** Сервер ответил ошибкой из договора: code — машинный код (unauthorized, forbidden, …). */
  | 'server'
  /** Ответ не по договору: сломанный JSON при 4xx/5xx или тело не прошло схему. */
  | 'contract';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(kind: ApiErrorKind, opts: { status?: number; code?: string; requestId?: string; message: string; cause?: unknown }) {
    super(opts.message, { cause: opts.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = opts.status ?? 0;
    this.code = opts.code ?? kind;
    this.requestId = opts.requestId;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

interface HttpConfig {
  /** Токен сессии мини-аппа (в памяти). null — запрос без Authorization. */
  getToken: () => string | null;
  /** Адрес API; пусто — тот же сайт (в разработке запросы проксирует Vite, в бою — Caddy). */
  baseUrl: string;
}

const config: HttpConfig = { getToken: () => null, baseUrl: '' };
let lastRequestId: string | undefined;

export function configureHttp(next: Partial<HttpConfig>): void {
  Object.assign(config, next);
}

/** X-Request-Id последнего ответа сервера — для отчёта об ошибке клиента. */
export function lastSeenRequestId(): string | undefined {
  return lastRequestId;
}

type HttpInit = RequestInit & { schema?: ResponseSchema };

export async function http<T>(url: string, init: HttpInit = {}): Promise<T> {
  const { schema, ...request } = init;
  const headers = new Headers(request.headers);
  headers.set('Accept', 'application/json');
  const token = config.getToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(config.baseUrl + url, { ...request, headers, credentials: 'same-origin' });
  } catch (cause) {
    // Отменённый запрос (ушли с экрана) — не «нет сети»: TanStack Query сам его проглотит.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('network', { message: `${request.method ?? 'GET'} ${url}: network error`, cause });
  }
  const requestId = res.headers.get('X-Request-Id') ?? undefined;
  if (requestId) lastRequestId = requestId;

  let text: string;
  try {
    text = await res.text();
  } catch (cause) {
    throw new ApiError('network', { status: res.status, requestId, message: `${url}: body interrupted`, cause });
  }

  if (!res.ok) throw serverError(res.status, text, requestId, url);

  // 204 — успех без тела (выход, отчёт об ошибке). Тело у ответа, который договор описал без тела, не читаем.
  if (res.status === 204 || !schema) return undefined as T;

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (cause) {
    // 200 с оборванным или пустым телом — это обрыв связи, а не пустой успех (docs/HANDOFF.md, «Клиент»).
    throw new ApiError('network', { status: res.status, requestId, message: `${url}: truncated JSON`, cause });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('contract', { status: res.status, requestId, message: `${url}: response does not match the contract: ${parsed.error.message}` });
  }
  // Тип T сгенерирован из той же схемы, по которой ответ только что проверен.
  return parsed.data as T;
}

function serverError(status: number, text: string, requestId: string | undefined, url: string): ApiError {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  const parsed = ErrorSchema.safeParse(body);
  if (!parsed.success) {
    // 502 от Caddy при выкладке, HTML-страница прокси и т. п.: кода из договора нет.
    return new ApiError(status >= 500 ? 'server' : 'contract', {
      status,
      requestId,
      code: status >= 500 ? 'internal' : 'bad_response',
      message: `${url}: ${status} without a contract error body`,
    });
  }
  return new ApiError('server', { status, code: parsed.data.code, requestId: parsed.data.requestId || requestId, message: `${url}: ${status} ${parsed.data.code}: ${parsed.data.message}` });
}

/**
 * Тип ошибки для сгенерированных хуков (Orval берёт его из mutator): любой отказ запроса — ApiError, тело
 * ошибки договора уже разобрано в его code и requestId.
 */
export type ErrorType<_Body> = ApiError;
