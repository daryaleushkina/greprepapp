// Настройки сборки в одном месте: имя, версия, провайдеры входа сайта.

/**
 * Рабочее имя до выбора бренда (PRODUCT.md, «Brand Commitments»: публично не используется; бренд — без GRE в
 * названии). Меняется здесь — и в заголовке страницы index.html.
 */
export const BRAND_NAME = 'GrePrepApp';

/** Версия сборки — короткий коммит (vite.config.ts); уходит в отчёты об ошибках и видна в настройках. */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION;

export type Provider = 'telegram' | 'apple' | 'google';

export interface ProviderConfig {
  authorizationEndpoint: string;
  clientId: string;
}

function provider(endpoint: string | undefined, clientId: string | undefined): ProviderConfig | null {
  if (!endpoint || !clientId) return null;
  return { authorizationEndpoint: endpoint, clientId };
}

/** Провайдер входа на сайте. null — аккаунта у провайдера ещё нет, кнопка говорит «ещё не подключён». */
export function providerConfig(p: Provider): ProviderConfig | null {
  const env = import.meta.env;
  switch (p) {
    case 'telegram':
      return provider(env.VITE_OIDC_TELEGRAM_AUTHORIZATION_ENDPOINT, env.VITE_OIDC_TELEGRAM_CLIENT_ID);
    case 'apple':
      return provider(env.VITE_OIDC_APPLE_AUTHORIZATION_ENDPOINT, env.VITE_OIDC_APPLE_CLIENT_ID);
    case 'google':
      return provider(env.VITE_OIDC_GOOGLE_AUTHORIZATION_ENDPOINT, env.VITE_OIDC_GOOGLE_CLIENT_ID);
  }
}

/** «Вход для разработки» на экране входа: в разработке всегда, в сборке — только если её собрали для e2e или стенда. */
export const DEV_SIGN_IN = import.meta.env.DEV || import.meta.env.VITE_DEV_SIGN_IN === '1';
