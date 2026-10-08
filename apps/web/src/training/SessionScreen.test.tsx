import { userEvent } from 'vitest/browser';
import { onlineManager } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { apiError, fakeServer, json, renderApp, STARTER, user, type Handler } from '../test/app';
import { givenAnswer, questionFixture, trainingSession } from '../test/training';
import { storedTraining, type StoredTraining } from './model';
import { trainingRepository } from './repository';

async function boot(training: StoredTraining = storedTraining(trainingSession(), Date.now()), handlers: Record<string, Handler> = {}, locale: 'ru' | 'en' = 'ru') {
  fakeServer({ 'GET /api/me': () => json(user({ locale })), 'GET /api/today': () => json(STARTER), ...handlers });
  vi.spyOn(trainingRepository, 'requestSync').mockImplementation(() => {});
  const app = await renderApp({ path: '/' });
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
