// Сайт: вход тремя способами через подменный провайдер (server/cmd/e2estack) — весь путь OIDC с PKCE, обмен
// кода на сервере, кука сессии; выход; отказы.
import type { Page } from '@playwright/test';
import { expect, newTelegramUser, signInitData, test } from '../fixtures';

const PROVIDERS = [
  ['Войти через Telegram', 'telegram'],
  ['Вход с Apple', 'apple'],
  ['Войти с аккаунтом Google', 'google'],
] as const;

/** Подменный провайдер пускает «человека» из login_hint: так тест задаёт, кто входит, или отказ (deny). */
async function loginAs(page: Page, hint: string) {
  await page.route('http://127.0.0.1:8094/auth?**', (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('login_hint', hint);
    return route.continue({ url: url.toString() });
  });
}

test.beforeEach(async ({ page, watch }) => {
  watch(page);
});

test('без входа — экран входа: три официальные кнопки, условия, дисклеймер ETS', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin$/);
  for (const [name] of PROVIDERS) await expect(page.getByRole('button', { name })).toBeVisible();
  await expect(page.getByText('Продолжая, вы принимаете условия и политику конфиденциальности.')).toBeVisible();
  await expect(page.getByText(/is a registered trademark of Educational Testing Service/)).toBeVisible();
});

for (const [button, provider] of PROVIDERS) {
  test(`вход «${button}» → «Сегодня»; после перезагрузки — всё ещё вошли; «Выйти» — снова вход`, async ({ page }, testInfo) => {
    // У Telegram человек — это его числовой id; у Apple и Google — строка sub.
    await loginAs(page, provider === 'telegram' ? String(newTelegramUser().id) : `${provider}-${testInfo.testId}`);
    await page.goto('/signin');
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();

    const narrow = (page.viewportSize()?.width ?? 0) < 600;
    if (narrow) {
      await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Прогресс' }).click();
      await page.getByRole('link', { name: 'Настройки' }).click();
    } else {
      await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Настройки' }).click();
    }
    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page.getByRole('button', { name: button })).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/signin$/);
  });
}

test('вход через Telegram на сайте попадает в аккаунт мини-аппа (тот же Telegram id)', async ({ page }) => {
  const user = newTelegramUser();
  // Сначала человек открыл мини-апп — аккаунт заведён по initData.
  const mini = await page.request.post('/api/auth/telegram-mini-app', { data: { initData: signInitData(user) } });
  expect(mini.status()).toBe(200);
  const miniAppAccount = ((await mini.json()) as { user: { id: string } }).user.id;
  // Потом — сайт, кнопка Telegram, тот же id у провайдера.
  await loginAs(page, String(user.id));
  await page.goto('/signin');
  await page.getByRole('button', { name: 'Войти через Telegram' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible();
  const me = await page.request.get('/api/me');
  expect(((await me.json()) as { id: string }).id).toBe(miniAppAccount);
});

test('отмена на странице провайдера — «Вход отменён», можно снова', async ({ page }) => {
  await loginAs(page, 'deny');
  await page.goto('/signin');
  await page.getByRole('button', { name: 'Войти с аккаунтом Google' }).click();
  await expect(page.getByRole('alert')).toHaveText('Вход отменён — можно попробовать снова.');
  await expect(page.getByRole('button', { name: 'Войти с аккаунтом Google' })).toBeEnabled();
});

test('чужой или подделанный возврат — «Не получилось войти», сессии нет', async ({ page }) => {
  await page.goto('/auth/callback?code=stolen&state=forged');
  await expect(page.getByRole('alert')).toHaveText('Не получилось войти. Попробуйте ещё раз.');
  const me = await page.evaluate(async () => (await fetch('/api/me')).status);
  expect(me).toBe(401);
});

test('вход подменой — для разработки и стенда', async ({ page }, testInfo) => {
  await page.goto('/signin');
  await page.getByPlaceholder('Имя тестового пользователя').fill(`dev-${testInfo.testId}`);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
});

test.describe('английский браузер', () => {
  test.use({ locale: 'en-US' });

  test('вход и новый аккаунт — по-английски', async ({ page }, testInfo) => {
    await loginAs(page, `google-en-${testInfo.testId}`);
    await page.goto('/signin');
    await expect(page.getByText('GRE® prep that explains every mistake — in Russian and in English.')).toBeVisible();
    await page.getByRole('button', { name: 'Sign in with Google' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByText('Words: review', { exact: true })).toBeVisible();
  });
});
