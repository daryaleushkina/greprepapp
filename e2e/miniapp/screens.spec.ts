// Каждый экран мини-аппа: вёрстка (ничего не наезжает на капсулу, не шире экрана, последнее видно, листается) и
// эталонный снимок. Новый экран или состояние — новая строка здесь (CLAUDE.md, «Тесты»).
import { checkScreen, expect, miniAppUrl, navLink, test } from '../fixtures';

test('«Сегодня»', async ({ miniApp: page }) => {
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
  await checkScreen(page, 'today');
});

test('разделы-заглушки, «Прогресс», настройки, шаг', async ({ miniApp: page }) => {
  await navLink(page, 'Слова').click();
  await expect(page.getByText('Скоро')).toBeVisible();
  await checkScreen(page, 'words');
  await navLink(page, 'Экзамен').click();
  await expect(page.getByText('Скоро')).toBeVisible();
  await checkScreen(page, 'exam');
  await navLink(page, 'Прогресс').click();
  await expect(page.getByText('Тренировок ещё не было')).toBeVisible();
  await checkScreen(page, 'progress');
  await page.getByRole('link', { name: 'Настройки' }).click();
  await expect(page.getByText('Версия e2e')).toBeVisible();
  await checkScreen(page, 'settings');
  await page.locator('#tg-mock-back').click();
  await navLink(page, 'Сегодня').click();
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByText('Здесь начнётся шаг. Тренировки и слова появятся в следующих частях.')).toBeVisible();
  await checkScreen(page, 'step');
});

test('загрузка — скелет ленты той же геометрии', async ({ page, watch, tgUser, tgTheme, tgPlatform, tgInsets }) => {
  watch(page);
  // План держим, пока снимаем скелет; потом отпускаем — дальше обычный экран.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/today', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(miniAppUrl(tgUser, { tgTheme, tgPlatform, tgInsets }));
  await expect(page.getByRole('status').filter({ hasText: 'Загружаем план на сегодня' })).toBeAttached();
  await checkScreen(page, 'today-loading');
  release();
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
});

test('не получилось загрузить план — «Повторить»', async ({ page, watch, tgUser, tgTheme, tgPlatform, tgInsets }) => {
  test.info().annotations.push({ type: 'expects-5xx', description: 'сервер «падает» нарочно' });
  watch(page);
  let fail = true;
  await page.route('**/api/today', (route) =>
    fail ? route.fulfill({ status: 500, json: { code: 'internal', message: 'e2e', requestId: 'e2e' } }) : route.continue(),
  );
  await page.goto(miniAppUrl(tgUser, { tgTheme, tgPlatform, tgInsets }));
  await expect(page.getByText('Не получилось загрузить план')).toBeVisible();
  await checkScreen(page, 'today-failed');
  fail = false;
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
});
