// Язык интерфейса до входа (после входа — язык аккаунта, User.locale). Языков два (PRODUCT.md, «Языки»).

export type Locale = 'ru' | 'en';

/**
 * Сайт: русский всегда, кроме браузера, у которого первый язык — английский и русского в списке нет
 * (решение Даши 06.10.2026). Аудитория русскоязычная, а в СНГ и у релокантов браузер часто стоит на
 * казахском, немецком и т. п. — таким тоже русский.
 */
export function browserLocale(languages: readonly string[]): Locale {
  const base = (tag: string) => tag.toLowerCase().split('-')[0];
  const first = languages[0];
  if (first !== undefined && base(first) === 'en' && !languages.some((l) => base(l) === 'ru')) return 'en';
  return 'ru';
}

/**
 * Мини-апп: по языку Telegram — так же, как сервер ставит язык аккаунта (server/internal/auth, Locale):
 * языки СНГ, которых у нас нет, — к русскому, остальное — английский.
 */
export function telegramLocale(languageCode: string | undefined): Locale {
  switch ((languageCode ?? '').toLowerCase().split('-')[0]) {
    case 'ru':
    case 'be':
    case 'kk':
    case 'ky':
    case 'uz':
    case 'tg':
      return 'ru';
    default:
      return 'en';
  }
}
