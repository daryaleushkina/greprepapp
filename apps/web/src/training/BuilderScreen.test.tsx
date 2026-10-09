import { onlineManager } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { apiError, fakeServer, json, renderApp, STARTER, user } from '../test/app';
import { givenAnswer, trainingOptions, trainingSession } from '../test/training';
import { trainingRepository } from './repository';

const boot = async (path = '/training/new', options = trainingOptions()) => {
  const server = fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER),
    'GET /api/trainings/options': () => json(options), 'POST /api/trainings': () => json(trainingSession()) });
  const app = await renderApp({ path });
  await expect.element(app.screen.getByRole('textbox', { name: 'Вопросов' })).toBeVisible();
  return { ...app, server };
};
test('с «Сегодня» можно открыть конструктор со всеми полями', async () => {
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER), 'GET /api/trainings/options': () => json(trainingOptions()) });
  const { screen } = await renderApp({ path: '/' });
  await screen.getByRole('link', { name: 'Своя тренировка' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Новая тренировка' })).toBeVisible();
  await expect.element(screen.getByRole('textbox', { name: 'Вопросов' })).toHaveValue('10');
});

test('выбор набора показывает его раздел, типы, число и режим вместо старой формы', async () => {
  const { screen, server } = await boot();
  await screen.getByRole('button', { name: 'Quant', exact: true }).click();
  await screen.getByRole('textbox', { name: 'Вопросов' }).fill('5');
  await screen.getByRole('radio', { name: 'Проверка на время' }).click();
  await expect.element(screen.getByRole('button', { name: 'Verbal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByRole('textbox', { name: 'Вопросов' })).toHaveValue('12');
  await expect.element(screen.getByRole('button', { name: 'Проверка', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByRole('combobox', { name: 'Тип' })).toHaveValue('preset');
  await screen.getByRole('button', { name: /Начать ·/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
  expect(await server.requests.find((r) => r.method === 'POST')?.json()).toMatchObject({ exam: 'gre', section: 'verbal', count: 12, mode: 'check', questionTypes: ['text_completion', 'sentence_equivalence'] });
});

test('повторная загрузка вариантов сохраняет недособранную форму и открытые темы', async () => {
  const options = trainingOptions();
  const { screen, queryClient } = await boot('/training/new', options);
  await screen.getByRole('button', { name: 'Quant', exact: true }).click();
  await screen.getByRole('textbox', { name: 'Вопросов' }).fill('5');
  await screen.getByRole('button', { name: /Темы и сложность/ }).click();
  await screen.getByRole('switch', { name: /Контраст/ }).click();
  await screen.getByRole('button', { name: 'Трудная', exact: true }).click();
  options.types[2]!.topics[0]!.title.ru = 'Обновлённый контраст';
  await queryClient.invalidateQueries({ queryKey: ['training-options'] });
  await expect.element(screen.getByText('Обновлённый контраст')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Темы и сложность' })).toBeVisible();
  await expect.element(screen.getByRole('switch', { name: /контраст/i })).not.toBeChecked();
  await expect.element(screen.getByRole('button', { name: 'Трудная', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await screen.getByRole('button', { name: /Готово ·/ }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Вопросов' })).toHaveValue('5');
});
test('поля, набор и темы меняют запрос; начать сохраняет и даёт единственный вход «Продолжить»', async () => {
  const { screen, server } = await boot();
  await screen.getByRole('radio', { name: 'Проверка на время' }).click();
  await expect.element(screen.getByRole('button', { name: 'Начать · 12 вопросов · ~18 мин' })).toBeEnabled();
  await screen.getByRole('button', { name: 'Quant', exact: true }).click();
  await screen.getByRole('combobox', { name: 'Тип' }).selectOptions('multiple_choice');
  await screen.getByRole('textbox', { name: 'Вопросов' }).fill('3abc');
  await screen.getByRole('button', { name: 'Проверка', exact: true }).click();
  await expect.element(screen.getByText('Таймер как на экзамене, разбор в конце')).toBeVisible();
  await screen.getByRole('button', { name: 'Темы и сложность все' }).click();
  // Название переключателя включает видимое число заданий, поэтому сравниваем название темы.
  await screen.getByRole('switch', { name: /Контраст/ }).click();
  await screen.getByRole('button', { name: 'Средняя', exact: true }).click();
  await screen.getByRole('button', { name: /Готово ·/ }).click();
  await screen.getByRole('button', { name: /Начать ·/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
  const posted = server.requests.find((r) => r.method === 'POST' && new URL(r.url).pathname === '/api/trainings');
  expect(await posted?.json()).toEqual({ exam: 'gre', section: 'quant', questionTypes: ['multiple_choice'], count: 2, mode: 'check', topicIds: ['cause'], difficulty: 'medium' });
  await screen.getByRole('link', { name: 'Закрыть тренировку' }).click();
  await expect.element(screen.getByRole('link', { name: /Продолжить тренировку/ })).toBeVisible();
  expect(screen.getByRole('link', { name: /Продолжить тренировку/ }).elements()).toHaveLength(1);
  await screen.getByRole('link', { name: /Продолжить тренировку/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
});
test('снять все темы, вернуть их и снять сложность', async () => {
  const { screen } = await boot();
  await screen.getByRole('button', { name: 'Темы и сложность все' }).click();
  await screen.getByRole('switch', { name: /Контраст/ }).click(); await screen.getByRole('switch', { name: /Причина/ }).click();
  await expect.element(screen.getByRole('button', { name: 'Готово · 0 вопросов' })).toBeDisabled();
  await screen.getByRole('switch', { name: /Контраст/ }).click(); await screen.getByRole('switch', { name: /Причина/ }).click();
  await screen.getByRole('button', { name: 'Трудная' }).click(); await screen.getByRole('button', { name: 'Лёгкая' }).click(); await screen.getByRole('button', { name: 'Любая' }).click();
  await screen.getByRole('button', { name: 'Готово · 12 вопросов' }).click();
  await screen.getByRole('button', { name: 'Темы и сложность все' }).click(); await screen.getByRole('button', { name: 'Назад' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Новая тренировка' })).toBeVisible();
});
test('прошлый набор выбирается сразу, один тип отражается в полях', async () => {
  const options = trainingOptions(); options.presets.push({ kind: 'last', request: { exam: 'gre', section: 'quant', questionTypes: ['multiple_choice'], count: 4, mode: 'practice' } });
  const { screen } = await boot('/training/new', options);
  await expect.element(screen.getByRole('radio', { name: 'Как в прошлый раз' })).toBeChecked();
  await screen.getByRole('radio', { name: 'Проверка на время' }).click(); await screen.getByRole('radio', { name: 'Как в прошлый раз' }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Вопросов' })).toHaveValue('4');
  await screen.getByRole('button', { name: 'Quant', exact: true }).click();
  await screen.getByRole('combobox', { name: 'Тип' }).selectOptions('multiple_choice');
  await screen.getByRole('button', { name: 'Практика', exact: true }).click();
  await screen.getByRole('button', { name: 'Назад' }).click(); await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
});
test('нет заданий — начать нельзя, незаполненное число тоже блокирует', async () => {
  const options = trainingOptions({ presets: [] }); options.types[0]!.topics = [];
  const { screen } = await boot('/training/new?section=verbal&type=text_completion', options);
  await expect.element(screen.getByRole('button', { name: 'Заданий пока нет' })).toBeDisabled();
  await screen.getByRole('combobox', { name: 'Тип' }).selectOptions('sentence_equivalence');
  await screen.getByRole('textbox', { name: 'Вопросов' }).fill('');
  await expect.element(screen.getByRole('button', { name: 'Заданий пока нет' })).toBeDisabled();
});
for (const [kind, message] of [
  ['no_questions', 'Под этот выбор заданий пока нет — попробуйте другие темы или сложность.'],
  ['failed', 'Не получилось начать тренировку. Попробуйте ещё раз.'],
  ['offline', 'Нет сети — тренировку не начать. Попробуйте, когда она появится.'],
] as const) test(`старт: ${kind}`, async () => {
  let fail = true;
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/trainings/options': () => json(trainingOptions()), 'POST /api/trainings': () => {
    if (!fail) return json(trainingSession());
    if (kind === 'offline') throw new TypeError('network');
    return apiError(kind === 'no_questions' ? 422 : 403, kind);
  } });
  const { screen } = await renderApp({ path: '/training/new' });
  await screen.getByRole('button', { name: /Начать ·/ }).click(); await expect.element(screen.getByRole('alert')).toHaveTextContent(message);
  fail = false; await screen.getByRole('button', { name: /Начать ·/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
});
test('нет сети после загрузки — кнопка выключена, запрос старта не уходит', async () => {
  const { screen, server } = await boot(); onlineManager.setOnline(false);
  await expect.element(screen.getByRole('button', { name: /Начать ·/ })).toBeDisabled();
  expect(server.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  onlineManager.setOnline(true); await expect.element(screen.getByRole('button', { name: /Начать ·/ })).toBeEnabled();
});
for (const offline of [true, false]) test(`опции недоступны: ${offline ? 'нет сети' : 'ошибка сервера'}, повтор восстанавливает`, async () => {
  let failing = true;
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/trainings/options': () => {
    if (failing && offline) throw new TypeError('network');
    return failing ? apiError(403, 'forbidden') : json(trainingOptions());
  } });
  const { screen } = await renderApp({ path: '/training/new' });
  await expect.element(screen.getByText(offline ? 'Нет сети' : 'Не получилось загрузить темы', { exact: true })).toBeVisible();
  failing = false; await screen.getByRole('button', { name: 'Повторить' }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Вопросов' })).toBeVisible();
});
test('загрузка тем объявлена, затем открывается форма', async () => {
  let release: () => void = () => {}; const held = new Promise<void>((r) => { release = r; });
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/trainings/options': async () => { await held; return json(trainingOptions()); } });
  const { screen } = await renderApp({ path: '/training/new' });
  await expect.element(screen.getByRole('status')).toHaveTextContent('Загружаем темы'); release();
  await expect.element(screen.getByRole('textbox', { name: 'Вопросов' })).toBeVisible();
});
test('нет локальной тренировки — объяснение; позиция сохранилась без сети', async () => {
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER) });
  const { screen, router } = await renderApp({ path: `/training/${trainingSession().id}` });
  await expect.element(screen.getByText('Тренировки нет на устройстве')).toBeVisible();
  vi.spyOn(trainingRepository, 'requestSync').mockImplementation(() => {});
  const owner = await trainingRepository.store.signIn(user().id); const { storedTraining } = await import('./model');
  await trainingRepository.store.put(owner, storedTraining(trainingSession(), Date.now()));
  await trainingRepository.moveTo(trainingSession().id, 2); await trainingRepository.answer(trainingSession().id, givenAnswer());
  await router.navigate({ to: '/' });
  await expect.element(screen.getByRole('link', { name: /вопрос 3 из 3/ })).toBeVisible();
  window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange'));
  await expect.poll(() => trainingRepository.requestSync).toHaveBeenCalled();
});

test('при повторном входе в конструктор сразу выбирается новая сборка «Как в прошлый раз»', async () => {
  const { schemas } = await import('@greprep/api-client');
  let last: ReturnType<typeof schemas.TrainingRequest.parse> | undefined;
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER),
    'GET /api/trainings/options': () => json(trainingOptions({ presets: [...(last ? [{ kind: 'last', request: last }] : []), ...trainingOptions().presets] })),
    'POST /api/trainings': async (req) => { last = schemas.TrainingRequest.parse(await req.json()); return json(trainingSession()); } });
  const { screen } = await renderApp({ path: '/training/new' });
  await screen.getByRole('textbox', { name: 'Вопросов' }).fill('3');
  await screen.getByRole('button', { name: /Начать ·/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
  await screen.getByRole('link', { name: 'Закрыть тренировку' }).click();
  await screen.getByRole('link', { name: 'Своя тренировка' }).click();
  await expect.element(screen.getByRole('radio', { name: 'Как в прошлый раз' })).toBeChecked();
  await expect.element(screen.getByRole('textbox', { name: 'Вопросов' })).toHaveValue('3');
});
