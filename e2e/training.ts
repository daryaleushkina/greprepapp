import type { Page } from '@playwright/test';
import { schemas } from '../packages/api-client/src';
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
  await expect(resume).toContainText(/Verbal · Text Completion · вопрос\s1\sиз\s\d/);
  expect(await resume.textContent()).toMatch(/вопрос\u00a01\u00a0из\u00a0\d/);
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

export async function presetMatchesForm(page: Page) {
  await page.getByRole('link', { name: 'Своя тренировка' }).click();
  await page.getByRole('button', { name: 'Quant', exact: true }).click();
  await page.getByRole('textbox', { name: 'Вопросов' }).fill('5');
  await page.getByRole('radio', { name: 'Проверка на время' }).click();
  await expect(page.getByRole('button', { name: 'Verbal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Вопросов' })).toHaveValue('12');
  await expect(page.getByRole('button', { name: 'Проверка', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Тип' }).locator('option:checked')).toHaveText('Text Completion · Sentence Equivalence');
  const posted = page.waitForRequest((req) => req.method() === 'POST' && new URL(req.url()).pathname === '/api/trainings');
  await page.getByRole('button', { name: /^Начать ·/ }).click();
  expect(schemas.TrainingRequest.parse((await posted).postDataJSON())).toMatchObject({ section: 'verbal', count: 12, mode: 'check',
    questionTypes: ['text_completion', 'sentence_equivalence'] });
  await expect(page.getByRole('heading', { name: 'Продолжить тренировку' })).toBeVisible();
}

export async function resumeCounterStaysTogether(page: Page) {
  // Граничный счётчик 10: у devseed только три задания типа. Ответы стенда проверяются договором до подмены.
  await page.route('**/api/trainings/options?*', async (route) => {
    const response = await route.fetch(); const options = schemas.TrainingOptions.parse(await response.json());
    await route.fulfill({ response, json: { ...options, types: options.types.map((type) => ({ ...type,
      topics: type.topics.map((topic) => ({ ...topic, available: { easy: 10, medium: 10, hard: 10 } })) })) } });
  });
  await page.route('**/api/trainings', async (route) => {
    const response = await route.fetch(); const session = schemas.TrainingSession.parse(await response.json());
    const items = Array.from({ length: 10 }, (_, position) => ({ ...session.items[position % session.items.length], position }));
    await route.fulfill({ response, json: schemas.TrainingSession.parse({ ...session, items }) });
  });
  await page.getByRole('link', { name: 'Своя тренировка' }).click();
  await page.getByRole('button', { name: /^Начать ·/ }).click();
  await page.getByRole('link', { name: 'Закрыть тренировку' }).click();
  const resume = page.getByRole('link', { name: /Продолжить тренировку/ });
  await expect(resume).toContainText(/вопрос\s1\sиз\s10/);
  const lines = await resume.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? ''; const start = text.indexOf('вопрос');
      if (start < 0) continue;
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, text.length);
      return range.getClientRects().length;
    }
    return 0;
  });
  expect(lines).toBe(1);
}

export async function unavailableStorageKeepsSession(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, 'open', { value: () => { throw new DOMException('fixture unavailable', 'SecurityError'); } });
  });
  await page.reload();
  await page.getByRole('link', { name: 'Своя тренировка' }).click();
  await expect(page.getByText('Нет места на устройстве', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Начать ·/ })).toBeDisabled();
  if (new URL(page.url()).pathname.startsWith('/tg/')) await page.locator('#tg-mock-back').click();
  else await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Своя тренировка' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByText('Здесь начнётся шаг. Тренировки и слова появятся в следующих частях.')).toBeVisible();
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
