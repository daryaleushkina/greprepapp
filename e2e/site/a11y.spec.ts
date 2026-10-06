// Доступность (axe, WCAG 2.2 AA) на ширине проекта.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

// Официальная кнопка Telegram — белое на #119AF5, 3,01 : 1: её цвета задаёт Telegram, свои мы не применяем
// (DESIGN.md, «Правило официальных кнопок»); то же исключение — в проверке контраста токенов
// (design/tokens/test/contrast.test.mjs, «кнопка Telegram»). Поэтому кнопка проверяется всеми правилами, кроме контраста.
const TELEGRAM = '[data-official-button="telegram"]';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page) {
  const rest = await new AxeBuilder({ page }).withTags(TAGS).exclude(TELEGRAM).analyze();
  if ((await page.locator(TELEGRAM).count()) === 0) return rest.violations;
  const telegram = await new AxeBuilder({ page }).withTags(TAGS).include(TELEGRAM).disableRules(['color-contrast']).analyze();
  return [...rest.violations, ...telegram.violations];
}

test('вход без нарушений', async ({ page, watch }) => {
  watch(page);
  await page.goto('/signin');
  await expect(page.getByRole('button', { name: 'Войти через Telegram' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('«Сегодня» без нарушений', async ({ site: page }) => {
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
  expect(await violations(page)).toEqual([]);
});
