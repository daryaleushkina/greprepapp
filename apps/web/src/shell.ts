// Оболочка приложения выбирается при запуске по адресу: мини-апп Telegram живёт под /tg/ (этот адрес задан
// боту — BotFather и scripts/setup-bot.mjs), всё остальное — сайт. По адресу, а не по «похоже на Telegram»:
// параметры запуска приходят во фрагменте и теряются при перезагрузке, а адрес — нет.

export type Shell = 'telegram' | 'site';

export const TELEGRAM_BASE = '/tg';

export function detectShell(pathname: string): Shell {
  return pathname === TELEGRAM_BASE || pathname.startsWith(`${TELEGRAM_BASE}/`) ? 'telegram' : 'site';
}

/** Вид клиента для сервера (ClientKind договора). */
export function clientKind(shell: Shell): 'telegram' | 'web' {
  return shell === 'telegram' ? 'telegram' : 'web';
}
