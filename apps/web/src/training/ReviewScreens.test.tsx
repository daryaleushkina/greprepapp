import { expect, test, vi } from 'vitest';
import { fakeServer, json, renderApp, STARTER, user } from '../test/app';
import { givenAnswer, trainingSession } from '../test/training';
import { storedTraining, type StoredTraining } from './model';
import { trainingRepository } from './repository';
import { TrainingMissingError, TrainingStorageBlockedError } from './store';

const completed = (): StoredTraining => ({ ...storedTraining(trainingSession({ mode: 'check' }), Date.now()),
  answers: { 0: givenAnswer(), 1: givenAnswer({ position: 1, optionIds: ['B'] }) },
  finish: { finishedAt: new Date().toISOString(), timedOut: true } });
async function boot(training = completed(), locale: 'ru' | 'en' = 'ru') {
  fakeServer({ 'GET /api/me': () => json(user({ locale })), 'GET /api/today': () => json(STARTER) });
  vi.spyOn(trainingRepository, 'requestSync').mockImplementation(() => {});
  const app = await renderApp({ path: '/' });
  await expect.element(app.screen.getByRole('heading', { level: 1 })).toBeVisible();
  const owner = await trainingRepository.store.currentOwner();
  if (!owner) throw new Error('fixture owner missing');
  await trainingRepository.store.put(owner, training);
  await app.router.navigate({ to: '/training/$trainingId', params: { trainingId: training.session.id } });
  await expect.element(app.screen.getByRole('heading', { level: 1 })).toBeVisible();
  return app;
}

test('итог → все ответы, фильтр ошибок, вопрос с разбором RU/EN → итог', async () => {
  const { screen } = await boot();
  await screen.getByRole('link', { name: 'Все ответы и разборы' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Разбор проверки' })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: /Вопрос 1, верно/ })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: /Вопрос 3, без ответа/ })).toBeVisible();
  await screen.getByRole('button', { name: 'Ошибки · 2' }).click();
  await expect.element(screen.getByRole('link', { name: /Вопрос 1, верно/ })).not.toBeInTheDocument();
  await screen.getByRole('link', { name: /Вопрос 2, неверно/ }).click();
  await expect.element(screen.getByText('ваш ответ', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('верный', { exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Почему не B?' }).click();
  await screen.getByRole('button', { name: 'EN', exact: true }).click();
  await expect.element(screen.getByText('Incorrect.', { exact: true })).toBeVisible();
  await expect.element(screen.getByTestId('explanation-option')).toHaveTextContent('Fixture');
  await screen.getByRole('link', { name: 'Назад', exact: true }).click();
  await screen.getByRole('link', { name: 'Назад', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: '1 из 3 верно' })).toBeVisible();
});

test('жалоба с вопроса требует категорию, сохраняет текст и показывает подтверждение', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await expect.element(screen.getByRole('button', { name: 'Отправить', exact: true })).toBeDisabled();
  await screen.getByRole('button', { name: 'В разборе', exact: true }).click();
  await screen.getByRole('textbox', { name: 'Что не так' }).fill('  Synthetic complaint  ');
  await screen.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Спасибо!' })).toBeVisible();
  const owner = await trainingRepository.store.currentOwner();
  if (!owner) throw new Error('fixture owner missing');
  expect((await trainingRepository.store.reports(owner))[0]?.report).toEqual({ kind: 'explanation', text: 'Synthetic complaint', trainingId: trainingSession().id });
  await screen.getByRole('button', { name: 'Вернуться к вопросу' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
});

test('пустой фильтр, правильный ответ и язык разбора из английского интерфейса', async () => {
  const training = completed(); training.session.mode = 'practice';
  training.answers = Object.fromEntries(training.session.items.map((item) => [item.position, givenAnswer({ position: item.position })]));
  const { screen } = await boot(training, 'en');
  await screen.getByRole('link', { name: 'All answers and explanations' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Practice review' })).toBeVisible();
  await screen.getByRole('button', { name: 'Mistakes · 0' }).click();
  await expect.element(screen.getByText('No mistakes.')).toBeVisible();
  await screen.getByRole('button', { name: 'All · 3' }).click();
  await screen.getByRole('link', { name: /Question 1, correct/ }).click();
  await expect.element(screen.getByRole('button', { name: 'EN', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await screen.getByRole('link', { name: 'Report a mistake' }).click();
  await screen.getByRole('link', { name: 'Back', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible();
});

for (const route of ['review', 'review/-1', 'report/99']) test(`глубокая ссылка ${route}: неверное состояние или позиция не раскрывают разбор`, async () => {
  const training = storedTraining(trainingSession(), Date.now());
  const app = await boot(training);
  if (route.startsWith('review/')) await trainingRepository.finish(training.session.id, false);
  await app.router.navigate({ to: `/training/${training.session.id}/${route}` });
  await expect.element(app.screen.getByText('Тренировки нет на устройстве', { exact: true })).toBeVisible();
  await expect.element(app.screen.getByTestId('explanation')).not.toBeInTheDocument();
});

test('жалоба из разбора: отказ устройства сохраняет ввод, повтор и пустой текст работают', async () => {
  const { screen } = await boot();
  await screen.getByRole('link', { name: 'Все ответы и разборы' }).click();
  await screen.getByRole('link', { name: /Вопрос 3, без ответа/ }).click();
  await expect.element(screen.getByText('без ответа', { exact: true })).toBeVisible();
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await screen.getByRole('button', { name: 'Другое', exact: true }).click();
  await screen.getByRole('textbox', { name: 'Что не так' }).fill('Synthetic fixture');
  const save = vi.spyOn(trainingRepository.store, 'putReport').mockRejectedValueOnce(new DOMException('private fixture', 'QuotaExceededError'));
  await screen.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Не получилось сохранить сообщение. Освободите место на устройстве и попробуйте снова.');
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toHaveValue('Synthetic fixture');
  await screen.getByRole('textbox', { name: 'Что не так' }).fill('  ');
  await screen.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Спасибо!' })).toBeVisible();
  expect(save.mock.calls[1]?.[1].report).toEqual({ kind: 'other', trainingId: trainingSession().id });
  await screen.getByRole('button', { name: 'Вернуться к вопросу' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Вопрос 3' })).toBeVisible();
});

test('жалоба: максимум 2000 символов Unicode, двойной сигнал и возврат во время сохранения', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await screen.getByRole('button', { name: 'В переводе', exact: true }).click();
  const unicode = screen.getByRole('textbox', { name: 'Что не так' }).element();
  if (!(unicode instanceof HTMLTextAreaElement)) throw new Error('fixture textarea missing');
  unicode.focus();
  const unicodeClipboard = new DataTransfer(); unicodeClipboard.setData('text/plain', '🧪'.repeat(2001));
  unicode.dispatchEvent(new ClipboardEvent('paste', { clipboardData: unicodeClipboard, bubbles: true, cancelable: true }));
  document.execCommand('insertText', false, '🧪'.repeat(2001));
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toHaveValue('🧪'.repeat(2000));
  let release = () => {}; const held = new Promise<void>((resolve) => { release = resolve; });
  const original = trainingRepository.recordReport.bind(trainingRepository);
  const save = vi.spyOn(trainingRepository, 'recordReport').mockImplementationOnce(async (questionId, report) => { await held; await original(questionId, report); });
  const button = screen.getByRole('button', { name: 'Отправить', exact: true }).element();
  try {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true })); button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect.poll(() => save.mock.calls.length).toBe(1);
    await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toBeDisabled();
    await screen.getByRole('link', { name: 'Назад', exact: true }).click();
  } finally { release(); }
  await expect.poll(async () => {
    const owner = await trainingRepository.store.currentOwner();
    return owner ? (await trainingRepository.store.reports(owner)).length : 0;
  }).toBe(1);
});


for (const route of ['review/1.0', 'review/0x1', 'report/1.0', 'report/0x1']) test(`позиция маршрута ${route} не принимается как целое`, async () => {
  const app = await boot();
  await app.router.navigate({ to: `/training/${trainingSession().id}/${route}` });
  await expect.element(app.screen.getByText('Тренировки нет на устройстве', { exact: true })).toBeVisible();
});

test('черновик жалобы переживает закрытие формы и очищается только отменой или отправкой', async () => {
  const { screen, router } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await screen.getByRole('button', { name: 'В переводе', exact: true }).click();
  await screen.getByRole('textbox', { name: 'Что не так' }).fill('Synthetic draft');
  await router.navigate({ to: '/training/$trainingId', params: { trainingId: trainingSession().id } });
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toHaveValue('Synthetic draft');
  await expect.element(screen.getByRole('button', { name: 'В переводе', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await screen.getByRole('link', { name: 'Назад', exact: true }).click();
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toHaveValue('');
});

test('длинная вставка видна, счётчик у предела, курсор остаётся в месте вставки', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  const input = screen.getByRole('textbox', { name: 'Что не так' });
  await expect.element(input).toHaveAttribute('maxlength', '2000');
  await input.fill('a'.repeat(1800));
  await expect.element(screen.getByText('1800 / 2000', { exact: true })).toBeVisible();
  const element = input.element(); if (!(element instanceof HTMLTextAreaElement)) throw new Error('fixture textarea missing');
  element.setSelectionRange(10, 10);
  const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'b'.repeat(201));
  element.focus();
  element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  document.execCommand('insertText', false, 'b'.repeat(201));
  await expect.element(screen.getByText('Вставка сокращена до 2000 символов. Проверьте текст перед отправкой.')).toHaveTextContent('Вставка сокращена до 2000 символов. Проверьте текст перед отправкой.');
  await expect.poll(() => element.selectionStart).toBe(210);
  await expect.element(input).toHaveValue('a'.repeat(10) + 'b'.repeat(200) + 'a'.repeat(1790));
});

test('смена владельца формы не предлагает освобождать место', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await screen.getByRole('button', { name: 'Другое', exact: true }).click();
  vi.spyOn(trainingRepository.store, 'putReport').mockResolvedValueOnce(false);
  await screen.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Сессия изменилась. Войдите снова и попробуйте отправить сообщение.');
});


test('пока черновик пишется, закрытие не требует подтверждения', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  const original = trainingRepository.store.putReportDraft.bind(trainingRepository.store);
  let release = () => {}; const held = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(trainingRepository.store, 'putReportDraft').mockImplementationOnce(async (...args) => { await held; return original(...args); });
  try {
    await screen.getByRole('button', { name: 'Другое', exact: true }).click();
    await expect.element(screen.getByText('Сохраняем черновик', { exact: true })).toBeInTheDocument();
    const closing = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(closing); expect(closing.defaultPrevented).toBe(false);
    release();
    await expect.element(screen.getByText('Черновик сохранён', { exact: true })).toBeInTheDocument();
    const closed = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(closed); expect(closed.defaultPrevented).toBe(false);
  } finally { release(); }
});


test('«Назад» уходит при сбое стирания черновика', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await screen.getByRole('button', { name: 'Другое', exact: true }).click();
  await expect.element(screen.getByText('Черновик сохранён', { exact: true })).toBeInTheDocument();
  vi.spyOn(trainingRepository.store, 'putReportDraft').mockRejectedValueOnce(new DOMException('Synthetic private text', 'SecurityError'));
  await screen.getByRole('link', { name: 'Назад', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
});

for (const modifier of ['metaKey', 'ctrlKey', 'button'] as const) test(`ссылка «Назад» сохраняет родное действие ${modifier}`, async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  const clear = vi.spyOn(trainingRepository, 'discardReportDraft');
  let prevented: boolean | undefined;
  const observe = (event: MouseEvent) => { prevented = event.defaultPrevented; event.preventDefault(); };
  document.addEventListener('click', observe, { once: true });
  screen.getByRole('link', { name: 'Назад', exact: true }).element().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ... (modifier === 'button' ? { button: 1 } : { [modifier]: true }) }));
  expect(prevented).toBe(false); expect(clear).not.toHaveBeenCalled();
});

test('200 изменений текста объединяются и не перечитывают тренировку', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toBeVisible();
  const input = screen.getByRole('textbox', { name: 'Что не так' }).element();
  const original = trainingRepository.reportDraft.bind(trainingRepository);
  let release = () => {}; const held = new Promise<void>((resolve) => { release = resolve; });
  const writing = vi.spyOn(trainingRepository, 'reportDraft').mockImplementationOnce(async (...args) => { await held; return original(...args); });
  const reading = vi.spyOn(trainingRepository, 'get');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  try {
    for (let i = 1; i <= 200; i++) { setter?.call(input, 'a'.repeat(i)); input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'a' })); }
    expect(writing.mock.calls.length).toBeLessThanOrEqual(1);
    window.dispatchEvent(new Event('pagehide')); release();
    await expect.element(screen.getByText('Черновик сохранён', { exact: true })).toBeInTheDocument();
    expect(writing.mock.calls.length).toBeLessThanOrEqual(3);
    expect(writing.mock.calls.at(-1)?.[2]?.text).toBe('a'.repeat(200));
    expect(reading).not.toHaveBeenCalled();
  } finally { release(); }
});

test('вставка и ввод не отменяются обработчиками формы', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  const input = screen.getByRole('textbox', { name: 'Что не так' });
  await input.fill('a'.repeat(2000));
  const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'b');
  const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }); input.element().dispatchEvent(paste);
  expect(paste.defaultPrevented).toBe(false);
  const before = new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: 'b', inputType: 'insertText' }); input.element().dispatchEvent(before);
  expect(before.defaultPrevented).toBe(false);
  await expect.element(screen.getByText('Вставка сокращена до 2000 символов. Проверьте текст перед отправкой.')).not.toBeInTheDocument();
});


for (const method of ['putReportDraft', 'putReport'] as const) test(`форма показывает блокировку миграции после ${method}, повтор сохраняет тренировку`, async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await screen.getByRole('button', { name: 'Другое', exact: true }).click();
  await expect.element(screen.getByText('Черновик сохранён', { exact: true })).toBeInTheDocument();
  vi.spyOn(trainingRepository.store, method).mockRejectedValueOnce(new TrainingStorageBlockedError());
  if (method === 'putReportDraft') { await screen.getByRole('textbox', { name: 'Что не так' }).fill('Synthetic'); window.dispatchEvent(new Event('pagehide')); }
  else await screen.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.element(screen.getByText('Закройте другие вкладки приложения и попробуйте снова.', { exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toBeVisible();
});

test('пропавшая запись жалобы имеет своё сообщение, ошибки формы не печатают ввод', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await screen.getByRole('button', { name: 'Другое', exact: true }).click();
  vi.spyOn(trainingRepository, 'recordReport').mockRejectedValueOnce(new TrainingMissingError()).mockRejectedValueOnce(new Error('Synthetic private text'));
  await screen.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Тренировки больше нет на устройстве. Вернитесь и начните новую.');
  await screen.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Не получилось сохранить сообщение на устройстве. Попробуйте снова.');
});

test('фон вкладки немедленно сохраняет последнюю версию, видимая вкладка не пишет', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toBeVisible();
  const writing = vi.spyOn(trainingRepository, 'reportDraft');
  document.dispatchEvent(new Event('visibilitychange')); expect(writing).not.toHaveBeenCalled();
  await screen.getByRole('textbox', { name: 'Что не так' }).fill('Synthetic latest');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(writing).toHaveBeenCalledWith(trainingSession().id, 0, { text: 'Synthetic latest' }, trainingRepository.reportOwner());
  await expect.element(screen.getByText('Черновик сохранён', { exact: true })).toBeInTheDocument();
});


test('нормализация переносов строк во вставке не выдаётся за сокращение', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toBeVisible();
  const input = screen.getByRole('textbox', { name: 'Что не так' }).element(); input.focus();
  const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'first\r\nsecond');
  input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  document.execCommand('insertText', false, 'first\r\nsecond');
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toHaveValue('first\nsecond');
  await expect.element(screen.getByText('Вставка сокращена до 2000 символов. Проверьте текст перед отправкой.')).not.toBeInTheDocument();
});


test('после переполнения черновика ввод сохраняет предупреждение и не запускает новые записи', async () => {
  const { screen } = await boot(storedTraining(trainingSession(), Date.now()));
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await screen.getByRole('button', { name: 'Другое', exact: true }).click();
  await expect.element(screen.getByText('Черновик сохранён', { exact: true })).toBeInTheDocument();
  const writing = vi.spyOn(trainingRepository.store, 'putReportDraft').mockRejectedValueOnce(new DOMException('Synthetic private text', 'QuotaExceededError'));
  await screen.getByRole('textbox', { name: 'Что не так' }).fill('Synthetic first'); window.dispatchEvent(new Event('pagehide'));
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Не получилось сохранить сообщение. Освободите место на устройстве и попробуйте снова.');
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toHaveAttribute('aria-busy', 'false');
  await screen.getByRole('textbox', { name: 'Что не так' }).fill('Synthetic last');
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Не получилось сохранить сообщение. Освободите место на устройстве и попробуйте снова.');
  expect(writing).toHaveBeenCalledTimes(1);
  await screen.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Спасибо!' })).toBeVisible();
});
