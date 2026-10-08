// Каждый экран сайта на ширине своего проекта: вёрстка и эталонный снимок (AGENTS.md, «Тесты»).
import { checkScreen, expect, navLink, test } from '../fixtures';

test('вход', async ({ page, watch }) => {
  watch(page);
  await page.goto('/signin');
  await expect(page.getByRole('button', { name: 'Войти через Telegram' })).toBeVisible();
  // Вход подменой — только на стенде; на снимке его нет, чтобы эталон был тем экраном, что видят люди.
  await checkScreen(page, 'signin', { mask: [page.locator('form')] });
  await page.goto('/signin?reason=expired');
  await expect(page.getByRole('alert')).toBeVisible();
  await checkScreen(page, 'signin-expired', { mask: [page.locator('form')] });
});

test('«Сегодня», разделы, настройки, шаг', async ({ site: page }) => {
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
  await checkScreen(page, 'today');
  await navLink(page, 'Слова').click();
  await expect(page.getByText('Скоро')).toBeVisible();
  await checkScreen(page, 'words');
  await navLink(page, 'Прогресс').click();
  await expect(page.getByText('Тренировок ещё не было')).toBeVisible();
  await checkScreen(page, 'progress');
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
  await checkScreen(page, 'settings');
  await page.goto('/step/verbal');
  await expect(page.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
  await checkScreen(page, 'step');
});
