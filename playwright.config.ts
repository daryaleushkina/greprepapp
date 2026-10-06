// Сквозные тесты веба: настоящий сервер Go с базой (server/cmd/e2estack), веб через Vite и браузеры в Docker.
//   pnpm e2e                          — все проекты
//   pnpm e2e --project=tg-ios-light   — один
//   pnpm e2e -u                       — переснять эталоны снимков (только при намеренной правке вида; сказать в коммите)
//
// Как устроено:
//   • браузеры — в образе Playwright (compose.yaml, сервис browsers): снимки рисует один и тот же Linux и на Маке, и в
//     CI, эталоны сравниваются везде (docs/ROADMAP.md §2). localhost стенда браузеру отдаёт Playwright (exposeNetwork);
//   • стенд — свои порты и база (сайт 5191 по https, API 8093, подменный OIDC 8094, greprep_web_e2e): сервер разработки,
//     стенд сценариев Apple (8091) и соседние проекты на Маке не мешают;
//   • мини-апп входит настоящим путём: фикстура подписывает initData ключом тестового бота (E2E_BOT_TOKEN), сервер
//     проверяет подпись; сайт — кнопками через подменный провайдер или входом подменой.
//
// Проекты: мини-апп — iPhone/WebKit и Android/Chromium, светлая и тёмная тема (CLAUDE.md, «Тесты»); сайт — компьютер
// (Chromium и WebKit/Safari, обе темы), средняя ширина и телефон.
import { defineConfig, devices, type PlaywrightTestOptions, type PlaywrightWorkerOptions, type Project } from '@playwright/test';

export interface TgOptions {
  /** Тема Telegram в подменённом окружении. */
  tgTheme: 'light' | 'dark';
  tgPlatform: 'ios' | 'android';
  /** safe top, safe bottom, content top, content bottom — как у клиента в полноэкранном режиме. */
  tgInsets: string;
}

/** Ключ тестового бота — не секрет: живёт только на стенде e2e, им же подписывает initData фикстура. */
export const E2E_BOT_TOKEN = '123456:E2E-local-bot-token';
const WEB = 'https://localhost:5191';
const API = '127.0.0.1:8093';
const OIDC = 'http://127.0.0.1:8094';
const BROWSERS = process.env.E2E_BROWSERS_WS ?? 'ws://127.0.0.1:3556/';

const MINIAPP = 'miniapp/**/*.spec.ts';
const SITE = 'site/**/*.spec.ts';
// e2e/_explore — черновые проверки агентов gp-explorer и gp-click-path (в git не попадают, нарочно падают на
// найденном). Обычный прогон их не видит; агенты запускают их с E2E_EXPLORE=1.
const EXPLORE = process.env.E2E_EXPLORE ? [] : ['**/_explore/**'];

const iphone = { ...devices['iPhone 15'], tgPlatform: 'ios' as const, tgInsets: '59,34,46,0' };
const android = { ...devices['Pixel 7'], tgPlatform: 'android' as const, tgInsets: '24,0,48,0' };
const desktop = { viewport: { width: 1280, height: 800 } };

type E2EProject = Project<PlaywrightTestOptions & TgOptions, PlaywrightWorkerOptions>;
const miniapp = (name: string, use: E2EProject['use']): E2EProject => ({ name, testMatch: MINIAPP, use });
const site = (name: string, use: E2EProject['use']): E2EProject => ({ name, testMatch: SITE, use });

export default defineConfig<TgOptions>({
  testDir: 'e2e',
  testIgnore: EXPLORE,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 6,
  retries: 1,
  // Упал и прошёл со второго раза — это не «прошёл»: нестабильный тест надо чинить.
  failOnFlakyTests: !process.env.E2E_ALLOW_FLAKY,
  timeout: 60_000,
  expect: {
    timeout: process.env.CI ? 15_000 : 8_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.002, scale: 'css' },
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  snapshotPathTemplate: '{testDir}/__screens__/{projectName}/{arg}{ext}',
  use: {
    baseURL: WEB,
    ignoreHTTPSErrors: true,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: process.env.CI ? 15_000 : 8_000,
    connectOptions: { wsEndpoint: BROWSERS, exposeNetwork: '<loopback>' },
  },
  webServer: [
    {
      // Стенд API: своя база с нуля, подменный OIDC, ключ тестового бота.
      command: 'go run ./cmd/e2estack',
      cwd: 'server',
      url: `http://${API}/api/health`,
      env: { E2E_BOT_TOKEN, E2E_WEB_ORIGIN: WEB, E2E_API_ADDR: API, E2E_OIDC_ADDR: OIDC.replace('http://', '') },
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @greprep/web exec vite --port 5191 --strictPort',
      url: WEB,
      ignoreHTTPSErrors: true,
      env: {
        GP_API_TARGET: `http://${API}`,
        GP_APP_VERSION: 'e2e',
        VITE_DEV_SIGN_IN: '1',
        VITE_OIDC_TELEGRAM_AUTHORIZATION_ENDPOINT: `${OIDC}/auth`,
        VITE_OIDC_TELEGRAM_CLIENT_ID: 'e2e-telegram',
        VITE_OIDC_APPLE_AUTHORIZATION_ENDPOINT: `${OIDC}/auth`,
        VITE_OIDC_APPLE_CLIENT_ID: 'e2e-apple',
        VITE_OIDC_GOOGLE_AUTHORIZATION_ENDPOINT: `${OIDC}/auth`,
        VITE_OIDC_GOOGLE_CLIENT_ID: 'e2e-google',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    miniapp('tg-ios-light', { ...iphone, tgTheme: 'light' }),
    miniapp('tg-ios-dark', { ...iphone, tgTheme: 'dark' }),
    miniapp('tg-android-light', { ...android, tgTheme: 'light' }),
    miniapp('tg-android-dark', { ...android, tgTheme: 'dark' }),
    site('site-desktop-light', { ...devices['Desktop Chrome'], ...desktop, colorScheme: 'light' }),
    site('site-desktop-safari-dark', { ...devices['Desktop Safari'], ...desktop, colorScheme: 'dark' }),
    site('site-medium', { ...devices['Desktop Chrome'], viewport: { width: 760, height: 900 }, colorScheme: 'light' }),
    site('site-phone', { ...devices['iPhone 15'], colorScheme: 'light' }),
  ],
});
