// Доступность (axe, WCAG 2.2 AA): контраст на стекле, подписи кнопок и ссылок, роли, язык страницы.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, navLink, test } from '../fixtures';

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']);

test('«Сегодня» и настройки без нарушений', async ({ miniApp: page }) => {
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
  await navLink(page, 'Прогресс').click();
  await expect(page.getByText('Тренировок ещё не было')).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
});

import { startSession } from '../training';
test('вопрос и итог тренировки без нарушений', async ({ miniApp: page }) => {
  const session = await startSession(page);
  expect((await axe(page).analyze()).violations).toEqual([]);
  for (let index = 0; index < session.items.length; index++) {
    await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
    await page.getByRole('button', { name: index < session.items.length - 1 ? /Дальше ·/ : 'Итог', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
});

import { finishForReview } from '../training';
test('список ответов, разбор и жалоба без нарушений', async ({ miniApp: page }) => {
  await finishForReview(page);
  await page.getByRole('link', { name: 'Все ответы и разборы' }).click();
  await expect(page.getByRole('heading', { name: 'Разбор проверки' })).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: /Вопрос 1, неверно/ }).click();
  await page.getByRole('button', { name: /^Почему не/ }).click();
  expect((await axe(page).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await expect(page.getByRole('heading', { name: 'Сообщить об ошибке' })).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
});
