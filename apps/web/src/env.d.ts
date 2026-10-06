/// <reference types="vite/client" />

// Настройки сборки сайта (адреса и client ID провайдеров входа — не секреты, они видны в адресе входа).
// Пусто — у провайдера ещё нет аккаунта: кнопка видна и честно говорит «ещё не подключён» (как в приложении Apple).
interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_OIDC_TELEGRAM_AUTHORIZATION_ENDPOINT?: string;
  readonly VITE_OIDC_TELEGRAM_CLIENT_ID?: string;
  readonly VITE_OIDC_APPLE_AUTHORIZATION_ENDPOINT?: string;
  readonly VITE_OIDC_APPLE_CLIENT_ID?: string;
  readonly VITE_OIDC_GOOGLE_AUTHORIZATION_ENDPOINT?: string;
  readonly VITE_OIDC_GOOGLE_CLIENT_ID?: string;
  /** 1 — показать на экране входа «вход для разработки» (локально, e2e, стенд). В бою сервер всё равно ответит 404. */
  readonly VITE_DEV_SIGN_IN?: string;
  /** 1 — подмена окружения Telegram в сборке (только сборка для e2e: в бою мини-апп открывает сам Telegram). */
  readonly VITE_TELEGRAM_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
