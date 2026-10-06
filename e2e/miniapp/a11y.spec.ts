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
