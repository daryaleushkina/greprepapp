// Ошибки клиента — на сервер, в таблицу client_errors (api/openapi.yaml, /api/client-errors): падение экрана,
// необработанная ошибка, ответ не по договору. Отчёт — фоновый: его неудача человеку не мешает и не показывается.
import { lastSeenRequestId, reportClientError } from '@greprep/api-client';
import { APP_VERSION } from '../config';
import { clientKind, type Shell } from '../shell';

let shell: Shell = 'site';
const recent = new Map<string, number>();
let sent = 0;
/** Больше отчётов с одной страницы не шлём: зациклившаяся ошибка не должна заваливать сервер. */
const MAX_PER_PAGE = 20;
/** Та же ошибка чаще раза в 10 секунд — один отчёт. */
const REPEAT_MS = 10_000;

export function configureReporter(next: Shell): void {
  shell = next;
}

/**
 * initData (tgWebAppData) и подписи в тексте ошибки — это действующий вход на сутки (INIT_DATA_MAX_AGE): в таблицу
 * ошибок они не попадают. Так бывает, когда @tma.js/sdk не принимает параметры запуска — он цитирует их целиком.
 */
export function redact(text: string): string {
  return text
    .replace(/(tgWebAppData|initData)=[^&\s"']*/g, '$1=[скрыто]')
    .replace(/\b(hash|signature)=[^&\s"']*/g, '$1=[скрыто]');
}

export function reportError(error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = redact(`${err.name}: ${err.message}`).slice(0, 2000);
  // В консоль — всегда; ограничения ниже — только для отчётов на сервер.
  console.error(err);
  const now = Date.now();
  const last = recent.get(message);
  if (sent >= MAX_PER_PAGE || (last !== undefined && now - last < REPEAT_MS)) return;
  recent.set(message, now);
  sent++;
  const requestId = lastSeenRequestId();
  reportClientError({
    message,
    ...(err.stack && { stack: redact(err.stack).slice(0, 16000) }),
    // Путь без параметров: в них могут быть код входа и прочее личное.
    route: location.pathname.slice(0, 512),
    ...(requestId && { requestId }),
    clientKind: clientKind(shell),
    appVersion: APP_VERSION || 'dev',
    occurredAt: new Date(now).toISOString(),
  }).catch((e: unknown) => {
    // Фон: отчёт не дошёл (нет сети, сервер лежит) — человеку это не показываем, в консоли видно.
    console.warn('client error report failed', e);
  });
}

/** Ошибки, которые никто не поймал: в обработчиках, таймерах, промисах. */
export function installGlobalReporter(): void {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}
