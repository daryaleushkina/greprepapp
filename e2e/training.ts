import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export async function buildAndResume(page: Page) {
  await page.getByRole('link', { name: 'Своя тренировка' }).click();
  await expect(page.getByRole('heading', { name: 'Новая тренировка' })).toBeVisible();
  if (new URL(page.url()).pathname.startsWith('/tg/')) await expect(page.locator('#tg-mock-back')).toBeVisible();
  await page.getByRole('textbox', { name: 'Вопросов' }).fill('3');
  await page.getByRole('button', { name: /Темы и сложность/ }).click();
  await expect(page.getByRole('heading', { name: 'Темы и сложность' })).toBeVisible();
  await page.getByRole('button', { name: 'Лёгкая', exact: true }).click();
  await page.getByRole('button', { name: /^Готово ·/ }).click();
  await page.getByRole('button', { name: /^Начать ·/ }).click();
  await expect(page).toHaveURL(/\/training\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: 'Продолжить тренировку' })).toBeVisible();
  await page.getByRole('link', { name: 'Закрыть тренировку' }).click();
  const resume = page.getByRole('link', { name: /Продолжить тренировку/ });
  await expect(resume).toContainText(/Verbal · Text Completion · вопрос 1 из \d/);
  await page.getByRole('link', { name: 'Своя тренировка' }).click();
  await expect(page.getByRole('radio', { name: 'Как в прошлый раз' })).toBeChecked();
  // В devseed одно лёгкое задание этого типа: последняя сборка хранит ограниченное доступностью число.
  await expect(page.getByRole('textbox', { name: 'Вопросов' })).toHaveValue('1');
  if (new URL(page.url()).pathname.startsWith('/tg/')) await page.locator('#tg-mock-back').click();
  else await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(resume).toBeVisible();
  await page.reload();
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.getByRole('heading', { name: 'Продолжить тренировку' })).toBeVisible();
}

export async function offlineBuilder(page: Page) {
  await page.getByRole('link', { name: 'Своя тренировка' }).click();
  const start = page.getByRole('button', { name: /^Начать ·/ });
  await expect(start).toBeEnabled();
  let attempts = 0;
  page.on('request', (req) => { if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/trainings') attempts++; });
  await page.context().setOffline(true);
  await expect(page.getByText('Нет сети — тренировку не начать. Попробуйте, когда она появится.')).toBeVisible();
  await expect(start).toBeDisabled();
  expect(attempts).toBe(0);
  await page.context().setOffline(false);
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole('heading', { name: 'Продолжить тренировку' })).toBeVisible();
}
