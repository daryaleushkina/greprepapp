// Общее для сквозных тестов: свой человек на каждый тест, приложение, открытое под ним, и проверка экрана
// (вёрстка + эталонный снимок).
import { createHmac, randomInt } from 'node:crypto';
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { E2E_BOT_TOKEN, type TgOptions } from '../playwright.config';
import { schemas } from '../packages/api-client/src';

export interface TelegramUser {
  id: number;
  first_name: string;
  language_code?: string;
}

/**
 * initData, подписанная ключом тестового бота так же, как её подписывает Telegram (core.telegram.org/bots/webapps,
 * «Validating data»): секрет — HMAC-SHA256 ключа бота с ключом «WebAppData», hash — HMAC строки проверки.
 * signature — поле Telegram с 2024 года: без него @tma.js/sdk не принимает параметры запуска.
 */
export function signInitData(user: TelegramUser, authDate = Math.floor(Date.now() / 1000)): string {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: `e2e-${user.id}`,
    signature: 'e2e-signature',
    user: JSON.stringify(user),
  };
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(E2E_BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** id Telegram из «тестового» диапазона: у каждого теста свой человек, тесты идут параллельно. */
export const newTelegramUser = (over: Partial<TelegramUser> = {}): TelegramUser => ({
  id: 8_000_000_000_000 + randomInt(1_000_000_000),
  first_name: 'Тест',
  language_code: 'ru',
  ...over,
});

/** Адрес мини-аппа с подменой Telegram (apps/web/src/telegram/mockEnv.ts) и подписанной initData. */
export function miniAppUrl(user: TelegramUser, o: TgOptions, path = '/'): string {
  const q = new URLSearchParams({ tgTheme: o.tgTheme, tgPlatform: o.tgPlatform, tgInsets: o.tgInsets, tgInitData: signInitData(user) });
  return `/tg${path}?${q.toString()}`;
}

/** Человек теста со своей сессией: запросы к API от его имени (проверка endpoint — AGENTS.md, «Тесты»). */
export interface Me {
  user: TelegramUser;
  /** Запрос к API от имени этого человека; ответ не 2xx — исключение с текстом ответа. */
  api: (method: string, path: string, body?: unknown) => Promise<unknown>;
}

type Fixtures = TgOptions & {
  /** Человек мини-аппа (Telegram). */
  tgUser: TelegramUser;
  /** Тот же человек, вошедший по initData: me.api(...) — запросы от его имени. */
  me: Me;
  /** Мини-апп, открытый под tgUser: вход по initData прошёл, «Сегодня» на экране. */
  miniApp: Page;
  /** Сайт, вошли подменой под своим именем: «Сегодня» на экране. */
  site: Page;
  /** Ошибки страницы и ответы сервера 5xx роняют тест — собираются для каждой страницы. */
  watch: (page: Page) => void;
};

export const test = base.extend<Fixtures>({
  tgTheme: ['light', { option: true }],
  tgPlatform: ['ios', { option: true }],
  tgInsets: ['0,0,0,0', { option: true }],

  // Свой «адрес» на каждый тест: сервер ограничивает частоту входа по адресу клиента (и верит X-Forwarded-For только
  // с 127.0.0.1 — как за Caddy), а параллельные тесты иначе делили бы одно окно и ловили 429.
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
  },

  tgUser: async ({}, use) => {
    await use(newTelegramUser());
  },

  me: async ({ request, page, tgUser }, use, testInfo) => {
    if (testInfo.project.name.startsWith('site-')) {
      const api = async (method: string, path: string, body?: unknown): Promise<unknown> => {
        const response = await page.request.fetch(`/api${path}`, { method, ...(body !== undefined && { data: body }) });
        if (!response.ok()) throw new Error(`${method} ${path}: ${response.status()} ${await response.text()}`);
        return response.status() === 204 ? undefined : await response.json();
      };
      await use({ user: tgUser, api });
      return;
    }
    const res = await request.post('/api/auth/telegram-mini-app', { data: { initData: signInitData(tgUser) } });
    expect(res.status(), await res.text()).toBe(200);
    const { token } = schemas.Session.parse(await res.json());
    if (!token) throw new Error('fixture session without bearer token');
    const api = async (method: string, path: string, body?: unknown): Promise<unknown> => {
      const r = await request.fetch(`/api${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(body !== undefined && { data: body }) });
      if (!r.ok()) throw new Error(`${method} ${path}: ${r.status()} ${await r.text()}`);
      return r.status() === 204 ? undefined : await r.json();
    };
    await use({ user: tgUser, api });
  },

  watch: async ({}, use, testInfo) => {
    const problems: string[] = [];
    await use((page) => {
      page.on('pageerror', (e) => problems.push(`ошибка страницы: ${e.message}`));
      page.on('response', (r) => {
        if (r.url().includes('/api/') && r.status() >= 500 && !testInfo.annotations.some((a) => a.type === 'expects-5xx')) {
          problems.push(`сервер ${r.status()}: ${r.request().method()} ${new URL(r.url()).pathname}`);
        }
      });
    });
    expect(problems, 'ошибки страницы и сервера').toEqual([]);
  },

  miniApp: async ({ page, tgUser, tgTheme, tgPlatform, tgInsets, watch }, use) => {
    watch(page);
    await page.goto(miniAppUrl(tgUser, { tgTheme, tgPlatform, tgInsets }));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    // Отступы выреза приходят от Telegram после первой отрисовки — ждём их, иначе снимки «до» и «после» разные.
    const [safeTop, , contentTop] = tgInsets.split(',');
    const inset = (name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
    await expect.poll(() => inset('--tg-viewport-safe-area-inset-top')).toBe(`${safeTop}px`);
    await expect.poll(() => inset('--tg-viewport-content-safe-area-inset-top')).toBe(`${contentTop}px`);
    await use(page);
  },

  site: async ({ page, watch }, use, testInfo) => {
    watch(page);
    // Вход подменой тем же запросом, что делает экран входа: кука __Host-session ложится в браузер этого теста.
    const res = await page.request.post('/api/auth/dev', {
      data: { name: `site-${testInfo.testId}-${randomInt(1e9)}`, transport: 'cookie', clientKind: 'web', locale: 'ru' },
    });
    expect(res.status(), await res.text()).toBe(200);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible({ timeout: 30_000 });
    await use(page);
  },
});
export { expect };

/** Вкладка капсулы (телефон, мини-апп) или пункт панели (сайт шире 600 px). */
export function navLink(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name, exact: true });
}

/**
 * Проверка экрана: вёрстка (ничего шире экрана, поверх нижней капсулы — только она при любой прокрутке, последнее
 * видно над ней, длинное листается) и эталонный снимок.
 */
export async function checkScreen(page: Page, name: string, opts: { mask?: Locator[] } = {}) {
  const issues = await page.evaluate(() => {
    const out: string[] = [];
    const main = document.querySelector<HTMLElement>('main.app-shell');
    if (!main) return ['нет main.app-shell'];
    const label = (el: Element) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`;
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`страница шире экрана: ${document.documentElement.scrollWidth} > ${innerWidth}`);
    if (main.scrollWidth > main.clientWidth + 1) out.push(`содержимое шире экрана: ${main.scrollWidth} > ${main.clientWidth}`);
    for (const el of main.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > innerWidth + 2) {
        out.push(`вылезает вправо: ${label(el)} (${Math.round(r.right)} > ${innerWidth})`);
        break;
      }
    }
    const scrollable = main.scrollHeight > main.clientHeight + 4;
    if (scrollable) {
      main.scrollTop = main.scrollHeight;
      if (main.scrollTop === 0) out.push('содержимое выше экрана, но не листается');
    }
    const bar = document.querySelector<HTMLElement>('.tabbar');
    if (bar && bar.getClientRects().length > 0 && getComputedStyle(bar).display !== 'none') {
      const b = bar.getBoundingClientRect();
      if (b.bottom > innerHeight + 1) out.push(`капсула вкладок ниже края экрана: ${Math.round(b.bottom)} > ${innerHeight}`);
      const over = new Set<string>();
      // Капсула скруглена на всю высоту: проверяем её прямоугольную середину, а не углы вне скругления.
      const r = b.height / 2;
      for (let y = 0; y <= main.scrollHeight; y += 60) {
        main.scrollTop = y;
        for (let x = b.left + r; x <= b.right - r; x += 20) {
          for (let yy = b.top + 4; yy < b.bottom - 4; yy += 12) {
            const el = document.elementFromPoint(x, yy);
            if (el && !el.closest('.tabbar')) over.add(label(el));
          }
        }
      }
      if (over.size) out.push(`поверх капсулы вкладок: ${[...over].slice(0, 3).join(', ')}`);
      if (scrollable) {
        main.scrollTop = main.scrollHeight;
        const last = [...main.querySelectorAll('*')].filter((c) => c.getBoundingClientRect().height > 0).at(-1);
        if (last && last.getBoundingClientRect().bottom > b.top + 2) out.push(`последнее (${label(last)}) прячется под капсулой`);
      }
    }
    main.scrollTop = 0;
    return out;
  });
  expect(issues, `вёрстка «${name}»`).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, { ...(opts.mask && { mask: opts.mask }) });
}
