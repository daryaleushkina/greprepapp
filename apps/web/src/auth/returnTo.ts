/** Адрес после входа — внешний ввод, включая запись попытки в хранилище вкладки. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  let decoded = value;
  // Проверяем и закодированные разделители: браузер и маршрутизатор могут декодировать их на разных шагах.
  for (let pass = 0; pass < 4; pass++) {
    if (!decoded.startsWith('/') || decoded.includes('//') || /[\\\u0000-\u001f\u007f-\u009f]/u.test(decoded)) return '/';
    const path = new URL(decoded, 'https://return.invalid').pathname.replace(/\/+$/u, '').toLowerCase();
    if (path === '/signin' || path === '/auth/callback') return '/';
    let next: string;
    try { next = decodeURIComponent(decoded); }
    catch { return '/'; }
    if (next === decoded) return value;
    decoded = next;
  }
  // Многослойное кодирование не нужно маршрутам приложения; ограничение не даёт разбору стать квадратичным.
  return '/';
}

/** «Сегодня» — адрес по умолчанию: не добавляем его в строку входа. */
export function returnToSearch(value: unknown): { returnTo?: string } {
  const returnTo = safeReturnTo(value);
  return returnTo === '/' ? {} : { returnTo };
}
