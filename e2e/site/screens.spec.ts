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
  await expect(page.getByRole('heading', { name: /Text Completion/ })).toBeVisible();
  await checkScreen(page, 'step');
});

test('конструктор и темы тренировки', async ({ site: page }) => {
  await page.getByRole('link', { name: 'Своя тренировка' }).click();
  await expect(page.getByRole('button', { name: /^Начать ·/ })).toBeEnabled();
  await checkScreen(page, 'training-builder');
  await page.getByRole('button', { name: /Темы и сложность/ }).click();
  await expect(page.getByRole('heading', { name: 'Темы и сложность' })).toBeVisible();
  await checkScreen(page, 'training-topics');
  await page.getByRole('button', { name: /^Готово ·/ }).click();
  await page.getByRole('button', { name: /^Начать ·/ }).click();
  await expect(page.getByRole('heading', { name: /Text Completion/ })).toBeVisible();
  await page.getByRole('link', { name: 'Закрыть тренировку' }).click();
  await expect(page.getByRole('link', { name: /Продолжить тренировку/ })).toBeVisible();
  await checkScreen(page, 'today-training');
});

import { stableTrainingScreens } from '../training';
test('вопросы, разбор, проверка со списком и итог', async ({ site: page }) => { await stableTrainingScreens(page); });

import { trainingBack } from '../training';
test('все ответы, отдельный разбор и жалоба', async ({ site: page }) => {
  const session = await stableTrainingScreens(page, false);
  await page.goto((new URL(page.url()).pathname.startsWith('/tg/') ? '/tg' : '') + '/training/' + session.id);
  await page.getByRole('link', { name: 'Все ответы и разборы' }).click();
  await expect(page.getByRole('heading', { name: 'Разбор тренировки' })).toBeVisible();
  await checkScreen(page, 'training-review');
  await page.getByRole('link', { name: /Вопрос 1, неверно/ }).click();
  await page.getByRole('button', { name: /^Почему не/ }).click();
  await checkScreen(page, 'training-review-item');
  await page.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await page.getByRole('button', { name: 'В разборе', exact: true }).click();
  await page.getByRole('textbox', { name: 'Что не так' }).fill('Проверьте, пожалуйста, разбор этого задания.');
  await checkScreen(page, 'training-report');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Спасибо!' })).toBeVisible();
  await checkScreen(page, 'training-report-saved');
  await trainingBack(page);
  await expect(page.getByRole('heading', { name: 'Вопрос 1', exact: true })).toBeVisible();
});
