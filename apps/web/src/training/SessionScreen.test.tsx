import { userEvent } from 'vitest/browser';
import { onlineManager } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { apiError, fakeServer, json, renderApp, STARTER, user, type Handler } from '../test/app';
import { givenAnswer, questionFixture, trainingSession } from '../test/training';
import { storedTraining, type StoredTraining } from './model';
import { trainingRepository } from './repository';
import { TrainingRules } from './rules';

async function boot(training: StoredTraining = storedTraining(trainingSession(), Date.now()), handlers: Record<string, Handler> = {}, locale: 'ru' | 'en' = 'ru', shell: 'site' | 'telegram' = 'site') {
  fakeServer({ 'GET /api/me': () => json(user({ locale })), 'GET /api/today': () => json(STARTER), ...handlers });
  vi.spyOn(trainingRepository, 'requestSync').mockImplementation(() => {});
  const app = await renderApp({ path: '/', shell });
  await expect.element(app.screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  const owner = await trainingRepository.store.currentOwner();
  if (!owner) throw new Error('fixture owner missing');
  await trainingRepository.store.put(owner, training);
  await app.router.navigate({ to: '/training/$trainingId', params: { trainingId: training.session.id } });
  await expect.element(app.screen.getByRole('heading', { level: 1 })).toBeVisible();
  return app;
}

test('практика: верный, неверный с RU/EN, «Не знаю», итог и исчезнувшее продолжение', async () => {
  const { screen } = await boot();
  await expect.element(screen.getByRole('button', { name: 'Проверить', exact: true })).toBeDisabled();
  await screen.getByRole('radio', { name: 'A A', exact: true }).click();
  await screen.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect.element(screen.getByText('Верно.', { exact: true })).toBeVisible();
  await screen.getByRole('button', { name: /Дальше · 2 из 3/ }).click();
  await screen.getByRole('radio', { name: 'B B', exact: true }).click();
  await screen.getByRole('button', { name: 'Проверить', exact: true }).click();
  await screen.getByRole('button', { name: 'Почему не B?' }).click();
  await screen.getByRole('button', { name: 'EN', exact: true }).click();
  await expect.element(screen.getByText('Incorrect.', { exact: true })).toBeVisible();
  await expect.element(screen.getByTestId('explanation-option')).toHaveTextContent('Fixture');
  await screen.getByRole('button', { name: /Дальше · 3 из 3/ }).click();
  await screen.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await screen.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: '1 из 3 верно' })).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Что повторить' })).toBeVisible();
  await screen.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect.element(screen.getByRole('link', { name: /Продолжить тренировку/ })).not.toBeInTheDocument();
});

function writeGate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function holdDraft() {
  const gate = writeGate();
  const original = trainingRepository.draft.bind(trainingRepository);
  const spy = vi.spyOn(trainingRepository, 'draft').mockImplementationOnce(async (id, position, ids) => {
    await gate.promise; await original(id, position, ids);
  });
  return { release: gate.release, spy };
}

function holdAnswer() {
  const gate = writeGate();
  const original = trainingRepository.answer.bind(trainingRepository);
  const spy = vi.spyOn(trainingRepository, 'answer').mockImplementationOnce(async (id, answer) => {
    await gate.promise; await original(id, answer);
  });
  return { release: gate.release, spy };
}

for (const key of ['Enter', 'ArrowRight']) test(`Enter и сразу ${key}: один ответ и переход по свежему состоянию`, async () => {
  const { screen } = await boot();
  await screen.getByRole('radio', { name: 'A A', exact: true }).click();
  await expect.poll(async () => (await trainingRepository.get(trainingSession().id))?.drafts?.['0']).toEqual(['A']);
  const held = holdAnswer();
  try {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await expect.poll(() => held.spy.mock.calls.length).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
  } finally { held.release(); }
  await expect.element(screen.getByLabelText('Вопрос 2 из 3')).toBeVisible();
  expect(held.spy).toHaveBeenCalledTimes(1);
});

for (const [type, blanks, keys] of [['sentence_equivalence', 1, ['a', 'b']], ['text_completion', 3, ['a', 'b', 'c']]] as const) test(`быстрые клавиши ${type}: выбор сразу и все записи по порядку`, async () => {
  const q = questionFixture(type, blanks);
  const { screen } = await boot(storedTraining(trainingSession({ items: [{ position: 0, question: q }] }), Date.now()));
  const held = holdDraft();
  try {
    for (const key of keys) window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    const role = q.selectCount === 2 ? 'checkbox' : 'radio';
    for (const option of screen.getByRole(role).all()) await expect.element(option).toBeEnabled();
    await expect.element(screen.getByRole(role, { name: type === 'sentence_equivalence' ? /B word 0/ : /B word 1/ })).toHaveAttribute('aria-checked', 'true');
  } finally { held.release(); }
  const expected = type === 'sentence_equivalence' ? ['A', 'B'] : ['A0', 'B1', 'C2'];
  await expect.poll(async () => (await trainingRepository.get(trainingSession().id))?.drafts?.['0']).toEqual(expected);
  expect(held.spy.mock.calls.map((call) => call[2])).toEqual(expected.map((_, index) => expected.slice(0, index + 1)));
});

test('быстрые касания в проверке: последняя запись побеждает без отката выбора', async () => {
  const { screen } = await boot(storedTraining(trainingSession({ mode: 'check' }), Date.now()));
  const held = holdAnswer();
  try {
    screen.getByRole('radio', { name: 'A A', exact: true }).element().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    screen.getByRole('radio', { name: 'B B', exact: true }).element().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect.element(screen.getByRole('radio', { name: 'B B', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect.element(screen.getByRole('radio', { name: 'A A', exact: true })).toBeEnabled();
  } finally { held.release(); }
  await expect.poll(async () => (await trainingRepository.get(trainingSession().id))?.answers['0']?.optionIds).toEqual(['B']);
  expect(held.spy.mock.calls.map((call) => call[1].optionIds)).toEqual([['A'], ['B']]);
});

test('Enter на варианте SE проверяет ответ; пробел меняет выбор', async () => {
  const q = questionFixture('sentence_equivalence');
  const { screen } = await boot(storedTraining(trainingSession({ items: [{ position: 0, question: q }] }), Date.now()));
  await screen.getByRole('checkbox', { name: /A word/ }).click();
  await screen.getByRole('checkbox', { name: /C word/ }).click();
  await expect.element(screen.getByRole('button', { name: 'Проверить', exact: true })).toBeEnabled();
  screen.getByRole('checkbox', { name: /C word/ }).element().focus();
  await userEvent.keyboard(' ');
  await expect.element(screen.getByRole('checkbox', { name: /C word/ })).toHaveAttribute('aria-checked', 'false');
  await userEvent.keyboard(' ');
  await expect.element(screen.getByRole('button', { name: 'Проверить', exact: true })).toBeEnabled();
  await userEvent.keyboard('{Enter}');
  await expect.element(screen.getByText('Верно.', { exact: true })).toBeVisible();
});

for (const action of ['select', 'flag']) test(`дедлайн до тика: ${action} не пишет поздний ответ и сразу показывает итог`, async () => {
  const started = Date.now();
  const training = storedTraining(trainingSession({ mode: 'check', timeLimitSeconds: 270 }), started);
  const { screen } = await boot(training);
  const save = vi.spyOn(trainingRepository, 'answer');
  vi.spyOn(Date, 'now').mockReturnValue(started + 270000);
  if (action === 'select') screen.getByRole('radio', { name: 'A A', exact: true }).element().dispatchEvent(new MouseEvent('click', { bubbles: true }));
  else screen.getByRole('button', { name: 'Отметить, чтобы вернуться' }).element().dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await expect.element(screen.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  expect(save).not.toHaveBeenCalled();
  expect((await trainingRepository.get(training.session.id))?.answers).toEqual({});
});

test('дедлайн во время записи: итог появляется сразу, принятый раньше ответ сохраняется', async () => {
  const started = Date.now();
  const training = storedTraining(trainingSession({ mode: 'check', timeLimitSeconds: 270 }), started);
  const { screen } = await boot(training);
  const held = holdAnswer();
  try {
    screen.getByRole('radio', { name: 'A A', exact: true }).element().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect.poll(() => held.spy.mock.calls.length).toBe(1);
    vi.spyOn(Date, 'now').mockReturnValue(started + 270000);
    document.dispatchEvent(new Event('visibilitychange'));
    await expect.element(screen.getByRole('heading', { name: '1 из 3 верно' })).toBeVisible();
  } finally { held.release(); }
  await expect.poll(async () => (await trainingRepository.get(training.session.id))?.finish?.timedOut).toBe(true);
  expect((await trainingRepository.get(training.session.id))?.answers['0']?.optionIds).toEqual(['A']);
});

test('фоновая отправка на дедлайне ждёт все принятые касания, затем отправляет ответ и итог', async () => {
  const training = storedTraining(trainingSession({ mode: 'check', timeLimitSeconds: 270 }), Date.now());
  const sent: string[] = [];
  await boot(training, {
    [`POST /api/trainings/${training.session.id}/answers`]: () => { sent.push('answer'); return new Response(null, { status: 204 }); },
    [`POST /api/trainings/${training.session.id}/finish`]: () => { sent.push('finish'); return json({ correct: 0, total: 3, unanswered: 2, durationSeconds: 270, review: [] }); },
  });
  const held = holdAnswer();
  try {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    await expect.poll(() => held.spy.mock.calls.length).toBe(1);
    // Часы репозитория и экрана пересекли срок; запись ещё не закончилась, отправка пришла из фона.
    vi.spyOn(TrainingRules, 'remainingSeconds').mockReturnValue(0);
    window.dispatchEvent(new Event('pageshow'));
    await trainingRepository.sync();
  } finally { held.release(); }
  await expect.poll(async () => (await trainingRepository.get(training.session.id))?.answers['0']?.optionIds).toEqual(['B']);
  vi.mocked(trainingRepository.requestSync).mockRestore();
  await trainingRepository.sync();
  expect(sent.at(-1)).toBe('finish');
  expect(sent[0]).toBe('answer');
});

test('ответы и итог уходят с keepalive: перезагрузка не обрывает отправку', async () => {
  const training = { ...storedTraining(trainingSession(), Date.now()), answers: { 0: givenAnswer() }, unsent: [0], finish: { finishedAt: new Date().toISOString(), timedOut: false } };
  const keepalive: boolean[] = [];
  await boot(training, {
    [`POST /api/trainings/${training.session.id}/answers`]: (req) => { keepalive.push(req.keepalive); return new Response(null, { status: 204 }); },
    [`POST /api/trainings/${training.session.id}/finish`]: (req) => { keepalive.push(req.keepalive); return json({ correct: 1, total: 3, unanswered: 2, durationSeconds: 1, review: [] }); },
  });
  await trainingRepository.sync();
  expect(keepalive).toEqual([true, true]);
});

test('проверка без лимита не раскрывает верность точками прогресса', async () => {
  await boot({ ...storedTraining(trainingSession({ mode: 'check' }), Date.now()), answers: { 0: givenAnswer() } });
  expect(document.querySelector('[data-result]')).toBeNull();
});

test('ошибка хранилища исчезает после удачной записи', async () => {
  const { screen } = await boot();
  vi.spyOn(trainingRepository, 'draft').mockRejectedValueOnce(new Error('fixture failure'));
  await screen.getByRole('radio', { name: 'A A' }).click();
  await expect.element(screen.getByRole('alert')).toBeVisible();
  await screen.getByRole('radio', { name: 'B B' }).click();
  await expect.poll(async () => (await trainingRepository.get(trainingSession().id))?.drafts?.['0']).toEqual(['B']);
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
});

test('слушатель клавиш не пересоздаётся при выборе и тиках таймера', async () => {
  await boot(storedTraining(trainingSession({ mode: 'check', timeLimitSeconds: 270 }), Date.now()));
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
  await expect.poll(async () => (await trainingRepository.get(trainingSession().id))?.answers['0']?.optionIds).toEqual(['A']);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
  expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
});

test('мини-апп: на вопросе и итоге нет собственной кнопки назад', async () => {
  const { screen } = await boot(undefined, {}, 'ru', 'telegram');
  await expect.element(screen.getByRole('link', { name: 'Закрыть тренировку' })).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await screen.getByRole('button', { name: /Дальше · 2/ }).click();
  await screen.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await screen.getByRole('button', { name: /Дальше · 3/ }).click();
  await screen.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await screen.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: 'Готово', exact: true })).not.toBeInTheDocument();
});

test('стили тренировок не меняют курсор посторонней выключенной кнопки', async () => {
  await boot();
  const outside = document.createElement('button');
  outside.disabled = true;
  const baseStyle = document.createElement('style');
  baseStyle.textContent = 'button { cursor: pointer; }';
  document.head.append(baseStyle); document.body.append(outside);
  try { expect(getComputedStyle(outside).cursor).toBe('pointer'); }
  finally { outside.remove(); baseStyle.remove(); }
});

test('проверка: пропуск, отметка, список, возврат и сохранение выбранного ответа', async () => {
  const { screen } = await boot(storedTraining(trainingSession({ mode: 'check', timeLimitSeconds: 270 }), Date.now()));
  await screen.getByRole('button', { name: 'Отметить, чтобы вернуться' }).click();
  await screen.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await screen.getByRole('radio', { name: 'A A', exact: true }).click();
  await screen.getByRole('button', { name: 'Все вопросы', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: 'Вопрос 1, без ответа, отмечен', exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Вопрос 1, без ответа, отмечен', exact: true }).click();
  await screen.getByRole('radio', { name: 'B B', exact: true }).click();
  await expect.poll(async () => (await trainingRepository.get(trainingSession().id))?.answers['0']?.optionIds).toEqual(['B']);
  await screen.getByRole('button', { name: 'Снять отметку' }).click();
  await screen.getByRole('button', { name: 'Все вопросы', exact: true }).click();
  await screen.getByRole('button', { name: 'Закончить', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: '1 из 3 верно' })).toBeVisible();
});

for (const [type, blanks] of [['text_completion', 1], ['text_completion', 2], ['text_completion', 3], ['sentence_equivalence', 1], ['quantitative_comparison', 1], ['multiple_choice', 1]] as const) test(`${type} · ${blanks}: все группы, подсказка и локальная проверка`, async () => {
  const q = questionFixture(type, blanks);
  const training = storedTraining(trainingSession({ items: [{ position: 0, question: q }] }), Date.now());
  const { screen } = await boot(training);
  const role = q.selectCount === 2 ? 'checkbox' : 'radio';
  if (type === 'quantitative_comparison') await expect.element(screen.getByText('Quantity A', { exact: true })).toBeVisible();
  for (let index = 0; index < q.groups.length; index++) {
    await screen.getByRole(role, { name: new RegExp(`A word ${index}`) }).click();
    if (blanks === 3 && index === 0) await expect.element(screen.getByText('Осталось выбрать слова для пропусков (ii), (iii)')).toBeVisible();
    if (blanks > 1 && index === blanks - 2) await expect.element(screen.getByText(new RegExp('Осталось выбрать слово для пропуска'))).toBeVisible();
  }
  if (q.selectCount === 2) {
    await expect.element(screen.getByText('Выберите ещё один ответ')).toBeVisible();
    await screen.getByRole(role, { name: /C word 0/ }).click();
    await screen.getByRole(role, { name: /C word 0/ }).click();
    await expect.element(screen.getByRole('button', { name: 'Проверить', exact: true })).toBeDisabled();
    await screen.getByRole(role, { name: /C word 0/ }).click();
  }
  await screen.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect.element(screen.getByText('Верно.', { exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect.element(screen.getByText('Без ошибок — повторять нечего.')).toBeVisible();
  await screen.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
});

test('два верных ключа и неверный SE: второй уровень, английский интерфейс и переключение обратно', async () => {
  const q = questionFixture('sentence_equivalence');
  const { screen } = await boot(storedTraining(trainingSession({ items: [{ position: 0, question: q }] }), Date.now()), {}, 'en');
  await screen.getByRole('checkbox', { name: /A word/ }).click();
  await screen.getByRole('checkbox', { name: /B word/ }).click();
  await screen.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect.element(screen.getByText(/The answers are/)).toBeVisible();
  await screen.getByRole('button', { name: 'Why not B word 0?' }).click();
  await expect.element(screen.getByTestId('explanation-option')).toHaveTextContent('Wrong choice.');
  await screen.getByRole('button', { name: 'RU' }).click();
  await expect.element(screen.getByText(/Верные ответы/)).toBeVisible();
  await screen.getByRole('button', { name: 'Почему не B word 0?' }).click();
  await expect.element(screen.getByTestId('explanation-option')).not.toBeInTheDocument();
});

test('выбор и позиция восстанавливаются при повторном открытии; раскрытый ответ нельзя изменить', async () => {
  const { screen, router } = await boot();
  await screen.getByRole('radio', { name: 'B B', exact: true }).click();
  await expect.poll(async () => (await trainingRepository.get(trainingSession().id))?.drafts?.['0']).toEqual(['B']);
  await screen.getByRole('link', { name: 'Закрыть тренировку' }).click();
  await screen.getByRole('link', { name: /Продолжить тренировку/ }).click();
  await expect.element(screen.getByRole('radio', { name: 'B B', exact: true })).toHaveAttribute('aria-checked', 'true');
  await screen.getByRole('button', { name: 'Проверить', exact: true }).click();
  await screen.getByRole('button', { name: /Дальше · 2/ }).click();
  await screen.getByRole('link', { name: 'Закрыть тренировку' }).click();
  await screen.getByRole('link', { name: /Продолжить тренировку/ }).click();
  await expect.element(screen.getByLabelText('Вопрос 2 из 3')).toBeVisible();
  await screen.getByRole('button', { name: 'Не знаю', exact: true }).click();
  await router.navigate({ to: '/' });
  await screen.getByRole('link', { name: /Продолжить тренировку/ }).click();
  await expect.element(screen.getByRole('radio')).not.toBeInTheDocument();
});

test('таймер по часам при возврате из фона заканчивает на дедлайне; не успел отделён от ошибок', async () => {
  const started = Date.now();
  const training = storedTraining(trainingSession({ mode: 'check', timeLimitSeconds: 270 }), started);
  const { screen } = await boot(training);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(started + 900000);
  document.dispatchEvent(new Event('visibilitychange'));
  await expect.element(screen.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  await expect.element(screen.getByText('Не успели: 3 вопроса.')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Что повторить' })).not.toBeInTheDocument();
  expect((await trainingRepository.get(training.session.id))?.finish?.finishedAt).toBe(new Date(started + 270000).toISOString());
  clock.mockRestore();
});

test('истёкшая закрытая проверка сразу показывает итог; короткая проверка округляет минуты', async () => {
  const { screen } = await boot(storedTraining(trainingSession({ mode: 'check', timeLimitSeconds: 20 }), Date.now() - 60000));
  await expect.element(screen.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  await expect.element(screen.getByText('Проверка · Verbal · 1 минута из 1')).toBeVisible();
});

test('клавиши A–E, Enter и стрелки: практика и проверка; модификаторы не отвечают', async () => {
  const { screen, router } = await boot();
  screen.getByRole('heading', { name: 'Text Completion' }).element().focus();
  await userEvent.keyboard('a');
  await expect.element(screen.getByRole('button', { name: 'Проверить', exact: true })).toBeEnabled();
  await userEvent.keyboard('{Enter}');
  await expect.element(screen.getByText('Верно.', { exact: true })).toBeVisible();
  await userEvent.keyboard('{ArrowRight}');
  await expect.element(screen.getByLabelText('Вопрос 2 из 3')).toBeVisible();
  const owner = await trainingRepository.store.currentOwner();
  if (!owner) throw new Error('fixture missing owner');
  const check = trainingSession({ id: '00000000-0000-4000-8000-000000000101', mode: 'check', timeLimitSeconds: 270 });
  await trainingRepository.store.put(owner, storedTraining(check, Date.now()));
  await router.navigate({ to: '/training/$trainingId', params: { trainingId: check.id } });
  await expect.element(screen.getByRole('timer')).toBeVisible();
  await userEvent.keyboard('{ArrowLeft}');
  await userEvent.keyboard('{Control>}a{/Control}');
  await expect.element(screen.getByRole('radio', { name: 'A A' })).toHaveAttribute('aria-checked', 'false');
  await userEvent.keyboard('a');
  await expect.element(screen.getByRole('radio', { name: 'A A' })).toBeEnabled();
  await userEvent.keyboard('{Enter}');
  await expect.element(screen.getByLabelText('Вопрос 2 из 3')).toBeVisible();
  await userEvent.keyboard('{ArrowLeft}');
  await expect.element(screen.getByLabelText('Вопрос 1 из 3')).toBeVisible();
  await screen.getByRole('button', { name: 'Все вопросы', exact: true }).click();
  await screen.getByRole('button', { name: 'К вопросу 1' }).click();
  await expect.element(screen.getByLabelText('Вопрос 1 из 3')).toBeVisible();
});

test('последний вопрос проверки ведёт к списку; назад возвращает к выбранному ответу', async () => {
  const { screen } = await boot({ ...storedTraining(trainingSession({ mode: 'check', timeLimitSeconds: 270 }), Date.now()), position: 2 });
  await screen.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect.element(screen.getByLabelText('Вопрос 2 из 3')).toBeVisible();
  await screen.getByRole('button', { name: /Дальше · 3/ }).click();
  await screen.getByRole('button', { name: 'К списку вопросов' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Все вопросы' })).toBeVisible();
});

test('запись не удалась: выбор возвращён и человеку видна ошибка', async () => {
  const { screen } = await boot();
  vi.spyOn(trainingRepository, 'draft').mockRejectedValueOnce(new Error('fixture failure'));
  await screen.getByRole('radio', { name: 'A A' }).click();
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Не получилось сохранить тренировку на устройстве. Освободите место и попробуйте снова.');
  await expect.element(screen.getByRole('radio', { name: 'A A' })).toHaveAttribute('aria-checked', 'false');
});

for (const failure of ['offline', 'no_questions', 'failed', 'success'] as const) test(`повтор по темам: ${failure}`, async () => {
  let posted: unknown;
  const session = trainingSession();
  const summary = { ...storedTraining(session, Date.now() - 62000), answers: { 0: givenAnswer({ optionIds: ['B'] }) }, finish: { finishedAt: new Date().toISOString(), timedOut: false } };
  const { screen } = await boot(summary, { 'POST /api/trainings': async (req) => {
    posted = await req.json();
    if (failure === 'offline') throw new TypeError('fixture network');
    if (failure === 'no_questions') return apiError(400, 'no_questions');
    if (failure === 'failed') return apiError(403, 'forbidden');
    return json(trainingSession({ id: '00000000-0000-4000-8000-000000000101' }));
  } });
  await expect.element(screen.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  if (failure === 'offline') {
    onlineManager.setOnline(false);
    await expect.element(screen.getByRole('button', { name: /Повторить ·/ })).toBeDisabled();
    onlineManager.setOnline(true);
  }
  await screen.getByRole('button', { name: /Повторить ·/ }).click();
  await expect.poll(() => posted).toMatchObject({ mode: 'practice', count: 6, topicIds: ['contrast'] });
  if (failure === 'success') await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
  else await expect.element(screen.getByText(failure === 'offline' ? 'Нет сети — тренировку не начать. Попробуйте, когда она появится.' : failure === 'no_questions' ? 'Под этот выбор заданий пока нет — попробуйте другие темы или сложность.' : 'Не получилось начать тренировку. Попробуйте ещё раз.')).toBeVisible();
});

test('главное действие сайта видно над нижним краем даже у длинного вопроса и разбора', async () => {
  const q = questionFixture('text_completion');
  q.prompt = 'Long condition with several sentences. '.repeat(35) + ' ___.';
  const { screen } = await boot(storedTraining(trainingSession({ items: [{ position: 0, question: q }] }), Date.now()));
  document.querySelector('main')!.scrollTop = 0;
  const primary = screen.getByRole('button', { name: 'Проверить', exact: true });
  await expect.poll(() => primary.element().getBoundingClientRect().bottom <= innerHeight).toBe(true);
  await screen.getByRole('button', { name: 'Не знаю', exact: true }).click();
  document.querySelector('main')!.scrollTop = 0;
  await expect.poll(() => screen.getByRole('button', { name: 'Итог', exact: true }).element().getBoundingClientRect().bottom <= innerHeight).toBe(true);
});

test('подсказки клавиш отражают число вариантов: SE, а не фиксированный A–E', async () => {
  const q = questionFixture('sentence_equivalence');
  q.groups[0]!.options.push({ id: 'D', text: 'D' }, { id: 'E', text: 'E' }, { id: 'F', text: 'F' });
  const { screen } = await boot(storedTraining(trainingSession({ items: [{ position: 0, question: q }] }), Date.now()));
  await expect.element(screen.getByText('A–F', { exact: true })).toBeInTheDocument();
});
