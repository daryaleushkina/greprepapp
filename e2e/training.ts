import type { Page } from '@playwright/test';
import { schemas } from '../packages/api-client/src';
import { checkScreen, expect } from './fixtures';

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
  await expect(page.getByRole('heading', { name: /Text Completion|Sentence Equivalence/ })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: /Text Completion|Sentence Equivalence/ })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: /Text Completion|Sentence Equivalence/ })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: /Text Completion|Sentence Equivalence/ })).toBeVisible();
}

export async function startSession(page: Page, mode: 'practice' | 'check' = 'practice', count = 3, section = 'Verbal', type = 'text_completion') {
  await page.getByRole('link', { name: 'Своя тренировка' }).click();
  await page.getByRole('button', { name: section, exact: true }).click();
  await page.getByRole('combobox', { name: 'Тип' }).selectOption(type);
  await page.getByRole('textbox', { name: 'Вопросов' }).fill(String(count));
  await page.getByRole('button', { name: mode === 'check' ? 'Проверка' : 'Практика', exact: true }).click();
  const response = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/trainings');
  await page.getByRole('button', { name: /^Начать ·/ }).click();
  const session = schemas.TrainingSession.parse(await (await response).json());
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(new RegExp('Text Completion|Sentence Equivalence|Quantitative Comparison|Multiple Choice'));
  return session;
}

export async function pick(page: Page, question: import('../packages/api-client/src').Question, wrong = false) {
  for (let index = 0; index < question.groups.length; index++) {
    const group = question.groups[index]!;
    const chosen = wrong && index === 0 ? [group.options.find((option) => !question.answer.includes(option.id))!.id, ...question.answer.filter((id) => group.options.some((option) => option.id === id)).slice(1)] : question.answer.filter((id) => group.options.some((option) => option.id === id));
    const container = page.getByRole(question.selectCount === 1 ? 'radiogroup' : 'group').nth(index);
    for (const id of chosen) {
      const option = container.getByRole(question.selectCount === 1 ? 'radio' : 'checkbox').nth(group.options.findIndex((option) => option.id === id));
      await expect(option).toBeEnabled();
      await option.click();
      await expect(option).toHaveAttribute('aria-checked', 'true');
    }
  }
}

export async function practiceThroughSummary(page: Page) {
  const session = await startSession(page);
  await pick(page, session.items[0]!.question);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByText('Верно.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Дальше · 2 из/ }).click();
  await pick(page, session.items[1]!.question, true);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByText('Неверно.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Почему не/ }).click();
  await expect(page.getByTestId('explanation-option')).toBeVisible();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByText('Incorrect.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('explanation')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await page.getByRole('button', { name: /Дальше · 3 из/ }).click();
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await expect(page.getByTestId('explanation')).toBeVisible();
  await page.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 из 3 верно' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Что повторить' })).toBeVisible();
  const request = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/trainings');
  await page.getByRole('button', { name: /^Повторить ·/ }).click();
  const repeated = schemas.TrainingRequest.parse((await request).postDataJSON());
  expect(repeated).toMatchObject({ mode: 'practice', section: 'verbal', count: 5 });
  expect(repeated.topicIds?.length).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Не знаю', exact: true })).toBeVisible();
}

export async function checkWithReturn(page: Page) {
  const session = await startSession(page, 'check');
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: 'Отметить, чтобы вернуться' }).click();
  await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await pick(page, session.items[1]!.question);
  await page.getByRole('button', { name: 'Все вопросы', exact: true }).click();
  await expect(page.getByText('Отвечено 1 из 3 · отмечено 1')).toBeVisible();
  await page.getByRole('button', { name: 'Вопрос 1, без ответа, отмечен', exact: true }).click();
  await pick(page, session.items[0]!.question);
  await page.getByRole('button', { name: 'Снять отметку' }).click();
  await page.getByRole('button', { name: 'Все вопросы', exact: true }).click();
  await page.getByRole('button', { name: 'Вопрос 3, без ответа', exact: true }).click();
  await page.getByRole('button', { name: 'К списку вопросов' }).click();
  await page.getByRole('button', { name: 'Закончить', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 из 3 верно' })).toBeVisible();
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page.getByRole('link', { name: /Продолжить тренировку/ })).toHaveCount(0);
}

export async function timeRunsOut(page: Page, closed = false) {
  await page.clock.install();
  const session = await startSession(page, 'check');
  await pick(page, session.items[0]!.question, true);
  if (closed) await page.getByRole('link', { name: 'Закрыть тренировку' }).click();
  await page.clock.fastForward((session.timeLimitSeconds! + 1) * 1000);
  if (closed) await page.goto((new URL(page.url()).pathname.startsWith('/tg') ? '/tg' : '') + '/training/' + session.id);
  await expect(page.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  await expect(page.getByText('Время вышло — неотвеченные не считаются ошибками темы.')).toBeVisible();
  await expect(page.getByText('Не успели: 2\u00a0вопроса.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Что повторить' })).toBeVisible();
  await expect(page.getByText('Проверка · Verbal · 5\u00a0минут из 5')).toBeVisible();
}

export async function reloadSession(page: Page) {
  const session = await startSession(page);
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await page.getByRole('button', { name: /Дальше · 2 из/ }).click();
  await pick(page, session.items[1]!.question);
  await expect(page.getByRole('button', { name: 'Проверить', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel('Вопрос 2 из 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Проверить', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByText('Верно.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Верно.', { exact: true })).toBeVisible();
}

export async function offlineSession(page: Page, me: import('./fixtures').Me) {
  const session = await startSession(page);
  await page.context().setOffline(true);
  await pick(page, session.items[0]!.question);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await page.getByRole('button', { name: /Дальше · 2 из/ }).click();
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await page.getByRole('button', { name: /Дальше · 3 из/ }).click();
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await page.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 из 3 верно' })).toBeVisible();
  const before = schemas.TrainingSession.parse(await me.api('GET', '/trainings/' + session.id));
  expect(before.items.every((item) => !item.answer)).toBe(true);
  await page.context().setOffline(false);
  await expect.poll(async () => schemas.TrainingSession.parse(await me.api('GET', '/trainings/' + session.id)).items.filter((item) => item.answer).length).toBe(3);
  await expect.poll(async () => schemas.TrainingSession.parse(await me.api('GET', '/trainings/' + session.id)).finishedAt).toBeTruthy();
  const stored = schemas.TrainingSession.parse(await me.api('GET', '/trainings/' + session.id));
  expect(stored.items[0]!.answer?.optionIds).toEqual(session.items[0]!.question.answer);
  expect(stored.items[1]!.answer?.dontKnow).toBe(true);
}

export async function keyboardSession(page: Page) {
  const session = await startSession(page, 'check', 3, 'Quant', 'multiple_choice');
  const question = session.items[0]!.question;
  const index = question.groups[0]!.options.findIndex((option) => question.answer.includes(option.id));
  await page.getByRole('heading', { level: 1 }).focus();
  await page.keyboard.press(String.fromCharCode(65 + index));
  await expect(page.getByRole('radio').nth(index)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Вопрос 2 из 3', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByLabel('Вопрос 1 из 3', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Вопрос 2 из 3', { exact: true })).toBeVisible();
}

/** Только эталоны вида: весь набор берём с сервера, порядок и количество фиксируем; поведение выше — без подмены тренировок. */
export async function stableTrainingScreens(page: Page, capture = true) {
  let blanks = 1;
  await page.route('**/api/trainings', async (route) => {
    const response = await route.fetch();
    const session = schemas.TrainingSession.parse(await response.json());
    const sorted = session.items.toSorted((a, b) => a.question.id.localeCompare(b.question.id));
    const first = sorted.find((item) => item.question.groups.length === blanks) ?? sorted[0]!;
    const chosen = [first, ...sorted.filter((item) => item !== first)].slice(0, 3);
    await route.fulfill({ response, json: { ...session, items: chosen.map((item, position) => ({ ...item, position })), ...(session.mode === 'check' && { timeLimitSeconds: 270 }) } });
  });
  await page.route('**/api/trainings/*/answers', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/trainings/*/finish', (route) => route.fulfill({ status: 200, json: { correct: 0, total: 3, unanswered: 0, durationSeconds: 60, review: [] } }));
  await page.clock.setFixedTime(new Date());
  const session = await startSession(page, 'practice', 50);
  if (capture) await checkScreen(page, 'training-question');
  await pick(page, session.items[0]!.question, true);
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await page.getByRole('button', { name: /^Почему не/ }).click();
  if (capture) await checkScreen(page, 'training-explanation');
  await page.getByRole('button', { name: /Дальше · 2 из/ }).click();
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await page.getByRole('button', { name: /Дальше · 3 из/ }).click();
  await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await page.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect(page.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  if (capture) await checkScreen(page, 'training-summary');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  const check = await startSession(page, 'check', 50);
  await page.getByRole('button', { name: 'Отметить, чтобы вернуться' }).click();
  if (capture) await checkScreen(page, 'training-timed');
  await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await pick(page, check.items[1]!.question);
  await page.getByRole('button', { name: 'Все вопросы', exact: true }).click();
  await expect(page.getByText('Отвечено 1 из 3 · отмечено 1')).toBeVisible();
  if (capture) await checkScreen(page, 'training-overview');
  await page.getByRole('link', { name: 'Закрыть тренировку' }).click();
  if (!capture) return;
  for (const [type, section, count, name] of [
    ['text_completion', 'Verbal', 2, 'training-tc2'], ['text_completion', 'Verbal', 3, 'training-tc3'],
    ['sentence_equivalence', 'Verbal', 1, 'training-se'], ['quantitative_comparison', 'Quant', 1, 'training-qc'], ['multiple_choice', 'Quant', 1, 'training-mc'],
  ] as const) {
    blanks = count;
    await startSession(page, 'practice', 50, section, type);
    await checkScreen(page, name);
    await page.getByRole('link', { name: 'Закрыть тренировку' }).click();
  }
}
