import { ApiError } from '@greprep/api-client';
import { deleteDB } from 'idb';
import { afterEach, expect, test, vi } from 'vitest';
import { givenAnswer, savedTraining, trainingOptions, trainingSession } from '../test/training';
import { TrainingRepository } from './repository';
import { TrainingStore } from './store';

const opened: { name: string; store: TrainingStore }[] = [];
const NOW = Date.parse('2026-10-06T09:00:00Z');
const request = { section: 'verbal', questionTypes: ['text_completion'], count: 3, mode: 'practice' } as const;
const make = (name = `queue-test-${crypto.randomUUID()}`, locks: LockManager | null = navigator.locks) => {
  const report = vi.fn(); const store = new TrainingStore(name, report); opened.push({ name, store });
  const api = { options: vi.fn(async () => trainingOptions()), start: vi.fn(async () => trainingSession()), answers: vi.fn(async () => {}),
    finish: vi.fn(async () => ({ correct: 1, total: 3, unanswered: 2, durationSeconds: 90, review: [] })), report: vi.fn(async () => {}) };
  const repo = new TrainingRepository(store, api, report, () => NOW, locks);
  const auto = vi.spyOn(repo, 'requestSync').mockImplementation(() => {});
  return { repo, store, api, report, auto, name };
};
const seed = async (m: ReturnType<typeof make>, id = trainingSession().id, finish = false) => {
  await m.repo.signedIn('a'); const owner = await m.store.signIn('a');
  const t = { ...savedTraining(id, NOW), answers: { 0: givenAnswer() }, unsent: [0],
    ...(finish && { finish: { finishedAt: '2026-10-06T09:01:00Z', timedOut: false } }) };
  await m.store.put(owner, t); return { owner, t };
};
const fail = (status: number, kind: 'server' | 'network' | 'contract' = 'server') => new ApiError(kind, { status, code: 'fixture', message: 'fixture' });
const deferred = () => { let resolve = () => {}; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };

const complaint = { kind: 'explanation', text: 'synthetic private complaint', trainingId: trainingSession().id } as const;
const questionId = trainingSession().items[0]!.question.id;
test('жалоба сохраняется без сети, переживает открытие и отправляется позже', async () => {
  const m = make(); await m.repo.signedIn('a');
  await m.repo.recordReport(questionId, complaint);
  m.api.report.mockRejectedValueOnce(fail(0, 'network'));
  await m.repo.sync();
  const next = make(m.name); await next.repo.signedIn('a'); await next.repo.sync();
  expect(next.api.report).toHaveBeenCalledExactlyOnceWith(questionId, complaint);
  await m.repo.sync(); expect(m.api.report).toHaveBeenCalledTimes(1);
  expect(m.report).not.toHaveBeenCalled();
});
for (const status of [400, 404, 409, 410, 422]) test(`жалоба: ${status} удаляется и сообщается без текста`, async () => {
  const m = make(); await m.repo.signedIn('a'); await m.repo.recordReport(questionId, complaint);
  m.api.report.mockRejectedValueOnce(new ApiError('server', { status, code: complaint.text, message: complaint.text }));
  await m.repo.sync(); await m.repo.sync();
  expect(m.api.report).toHaveBeenCalledTimes(1);
  expect(m.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: `training report rejected: ${status}` }));
});
for (const status of [403, 408, 429, 500, 503]) test(`жалоба: ${status} ждёт, следующая уходит`, async () => {
  const m = make(); await m.repo.signedIn('a');
  await m.repo.recordReport(questionId, complaint); await m.repo.recordReport(questionId, { kind: 'question' });
  m.api.report.mockRejectedValueOnce(fail(status)); await m.repo.sync();
  expect(m.api.report).toHaveBeenCalledTimes(2);
  await m.repo.sync(); expect(m.api.report).toHaveBeenCalledTimes(3);
  expect(m.api.report).toHaveBeenLastCalledWith(questionId, complaint);
});
test('жалоба: 401 ждёт входа того же человека, выход стирает очередь', async () => {
  const m = make(); await m.repo.signedIn('a'); await m.repo.recordReport(questionId, complaint);
  m.api.report.mockRejectedValueOnce(fail(401)); await m.repo.sync(); await m.repo.sync();
  expect(m.api.report).toHaveBeenCalledTimes(1);
  await m.repo.signedIn('a'); await m.repo.sync(); expect(m.api.report).toHaveBeenCalledTimes(2);
  await m.repo.recordReport(questionId, complaint); await m.repo.signOut();
  await m.repo.signedIn('a'); await m.repo.sync(); expect(m.api.report).toHaveBeenCalledTimes(2);
});
test('жалоба: другой аккаунт стирает старую очередь и сообщает только число', async () => {
  const m = make(); await m.repo.signedIn('a'); await m.repo.recordReport(questionId, complaint);
  m.repo.pause(); await m.repo.signedIn('b'); await m.repo.sync();
  expect(m.api.report).not.toHaveBeenCalled();
  expect(m.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training account changed: 1 unsent reports lost' }));
});
test('жалоба: Web Locks двух вкладок не дублирует отправку', async () => {
  const m = make(); await m.repo.signedIn('a'); await m.repo.recordReport(questionId, complaint);
  const next = make(m.name); await next.repo.signedIn('a');
  await Promise.all([m.repo.sync(), next.repo.sync()]);
  expect(m.api.report.mock.calls.length + next.api.report.mock.calls.length).toBe(1);
});

test('две очереди одной сессии удерживают отправку до последней записи, другие сессии уходят', async () => {
  const m = make(); const { t } = await seed(m);
  const other = await seed(m, '00000000-0000-4000-8000-000000000101');
  const first = m.repo.holdSync(t.session.id), second = m.repo.holdSync(t.session.id);
  await m.repo.sync();
  expect(m.api.answers).toHaveBeenCalledExactlyOnceWith(other.t.session.id, { answers: [givenAnswer()] });
  first(); first();
  await m.repo.sync();
  expect(m.api.answers).toHaveBeenCalledTimes(1);
  second(); await m.repo.sync();
  expect(m.api.answers).toHaveBeenNthCalledWith(2, t.session.id, { answers: [givenAnswer()] });
});
afterEach(async () => { for (const { store } of opened) await store.close(); for (const name of new Set(opened.map((s) => s.name))) await deleteDB(name); opened.length = 0; });

test('постоянный отказ пачки проверяет ответы отдельно и не теряет верный при временном отказе', async () => {
  const m = make(); const { owner, t } = await seed(m);
  const second = givenAnswer({ position: 1 });
  await m.store.put(owner, { ...t, answers: { 0: givenAnswer(), 1: second }, unsent: [0, 1] });
  m.api.answers.mockRejectedValueOnce(fail(400)).mockResolvedValueOnce(undefined).mockRejectedValueOnce(fail(429));
  await m.repo.sync();
  expect(m.api.answers).toHaveBeenCalledTimes(3);
  expect((await m.repo.get(t.session.id))?.unsent).toEqual([1]);
  expect(m.report).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'training sync rejected: 400' }));
  m.api.answers.mockRejectedValueOnce(fail(422)); await m.repo.sync();
  expect((await m.repo.get(t.session.id))?.unsent).toEqual([]);
  expect(m.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training sync rejected: 422' }));
});

test('неверный ответ пачки отклоняется отдельно, а верный отправляется', async () => {
  const m = make(); const { owner, t } = await seed(m);
  await m.store.put(owner, { ...t, answers: { 0: givenAnswer(), 1: givenAnswer({ position: 1 }) }, unsent: [0, 1] });
  m.api.answers.mockRejectedValueOnce(fail(400)).mockRejectedValueOnce(fail(400)).mockResolvedValueOnce(undefined);
  await m.repo.sync();
  expect(m.api.answers).toHaveBeenNthCalledWith(2, t.session.id, { answers: [givenAnswer()] });
  expect(m.api.answers).toHaveBeenNthCalledWith(3, t.session.id, { answers: [givenAnswer({ position: 1 })] });
  expect((await m.repo.get(t.session.id))?.unsent).toEqual([]);
  expect(m.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training sync rejected: 400' }));
});

test('чтение недоступного устройства сообщается; остальное приложение может работать', async () => {
  const m = make(); await seed(m);
  vi.spyOn(m.store, 'list').mockRejectedValueOnce(new DOMException('private', 'SecurityError'));
  expect(await m.repo.list()).toEqual([]); expect(m.repo.storageStatus()).toBe('unavailable');
  expect(await m.repo.options()).toEqual(trainingOptions());
  await m.repo.signedIn('a'); vi.spyOn(m.store, 'get').mockRejectedValueOnce(new DOMException('private', 'QuotaExceededError'));
  expect(await m.repo.get(trainingSession().id)).toBeUndefined(); expect(m.repo.storageStatus()).toBe('unavailable');
  expect(m.report).not.toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('private') }));
});

test('«Продолжить» перечитывает изменённую запись, а остальные тренировки повторно не разбирает', async () => {
  const m = make(); await seed(m); const list = vi.spyOn(m.store, 'list');
  expect((await m.repo.active())?.position).toBe(0);
  await m.repo.moveTo(trainingSession().id, 2); expect((await m.repo.active())?.position).toBe(2);
  expect(list).toHaveBeenCalledTimes(1);
  await m.repo.finish(trainingSession().id, false); expect(await m.repo.active()).toBeUndefined();
  expect(await m.repo.active()).toBeUndefined(); expect(list).toHaveBeenCalledTimes(2);
});

test('после выхода и входа того же аккаунта в другой вкладке принимается новая ревизия', async () => {
  const m = make(); const { owner } = await seed(m);
  const other = make(m.name); await other.repo.signedIn('a'); await other.repo.signOut(); await other.repo.signedIn('a');
  const next = await other.store.signIn('a'); expect(next.revision).toBeGreaterThan(owner.revision);
  await other.store.put(next, savedTraining(trainingSession().id, NOW));
  await expect.poll(async () => {
    try { await m.repo.moveTo(trainingSession().id, 2); return (await m.repo.get(trainingSession().id))?.position; }
    catch { return undefined; } // Сигнал второй вкладки ещё может идти; ожидаем принятия ревизии.
  }).toBe(2);
  await m.repo.answer(trainingSession().id, givenAnswer()); await m.repo.finish(trainingSession().id, false);
  expect(await other.store.get(next, trainingSession().id)).toMatchObject({ position: 2, unsent: [0], finish: { timedOut: false } });
});

test('непринятая запись из-за другой ревизии бросает ошибку и сообщает её', async () => {
  const m = make(); await seed(m); const other = make(m.name);
  await other.repo.signedIn('b');
  await expect(m.repo.moveTo(trainingSession().id, 1)).rejects.toThrow();
  expect(m.report).toHaveBeenCalled();
});

test('новый вход того же человека ждёт очистки после явного выхода', async () => {
  const m = make(); await seed(m); const held = deferred();
  const clear = m.store.signOut.bind(m.store);
  const signOut = vi.spyOn(m.store, 'signOut').mockImplementationOnce(async (owner) => { await held.promise; await clear(owner); });
  const leaving = m.repo.signOut();
  await expect.poll(() => signOut.mock.calls.length).toBe(1);
  const entering = m.repo.signedIn('a');
  held.resolve(); await Promise.all([leaving, entering]);
  await expect(m.repo.start({ ...request, questionTypes: [...request.questionTypes] })).resolves.toBe(trainingSession().id);
});

test('опции запрашиваются с четырьмя типами; старт скачивает всё и сохраняет до открытия', async () => {
  const m = make(); await m.repo.signedIn('a'); expect(await m.repo.options()).toEqual(trainingOptions());
  expect(m.api.options).toHaveBeenCalledWith({ types: ['text_completion', 'sentence_equivalence', 'quantitative_comparison', 'multiple_choice'] }, { signal: undefined });
  const id = await m.repo.start({ ...request, questionTypes: [...request.questionTypes] });
  expect(await m.repo.get(id)).toEqual(savedTraining(id, NOW));
  expect((await m.repo.active())?.session.id).toBe(id);
});
test('до входа и после выхода нет тренировок и отправки', async () => {
  const m = make(); expect(await m.repo.list()).toEqual([]); expect(await m.repo.get('none')).toBeUndefined();
  await expect(m.repo.start({ ...request, questionTypes: [...request.questionTypes] })).rejects.toThrow('without session');
  // Без владельца несохранённое действие тоже отклоняется, а очередь ничего не отправляет.
  await expect(m.repo.moveTo('none', 0)).rejects.toThrow();
  await m.repo.sync(); await m.repo.signOut(); expect(m.api.answers).not.toHaveBeenCalled();
});
test('ответы отправляются перед концом, подтверждённое не повторяется', async () => {
  const m = make(); const { owner, t } = await seed(m, undefined, true);
  await m.repo.sync(); await m.repo.sync(); expect(m.api.answers).toHaveBeenCalledTimes(1); expect(m.api.finish).toHaveBeenCalledTimes(1);
  expect(m.api.answers.mock.invocationCallOrder[0]).toBeLessThan(m.api.finish.mock.invocationCallOrder[0] ?? 0);
  expect(await m.store.get(owner, t.session.id)).toMatchObject({ unsent: [], finishSent: true });
  expect(await m.repo.active()).toBeUndefined();
});
for (const status of [400, 404, 409, 410, 422]) for (const what of ['answers', 'finish'] as const) test(`${what}: ${status} удаляется из очереди и сообщает отказ`, async () => {
  const m = make(); const { owner, t } = await seed(m, undefined, true);
  m.api[what].mockRejectedValueOnce(fail(status)); await m.repo.sync(); await m.repo.sync();
  expect(m.api[what]).toHaveBeenCalledTimes(1); expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ message: `training sync rejected: ${status}` }));
  expect(await m.store.get(owner, t.session.id)).toMatchObject({ unsent: [], finishSent: true });
});
for (const status of [403, 408, 429, 500, 503]) for (const what of ['answers', 'finish'] as const) test(`${what}: ${status} ждёт, остальные тренировки уходят`, async () => {
  const m = make(); const { owner, t } = await seed(m, undefined, true);
  const second = { ...t, session: { ...t.session, id: '00000000-0000-4000-8000-000000000101' }, startedAtMillis: NOW + 1 };
  await m.store.put(owner, second); m.api[what].mockRejectedValueOnce(fail(status)); await m.repo.sync();
  expect(await m.store.get(owner, second.session.id)).toMatchObject({ unsent: [], finishSent: true });
  expect(await m.store.get(owner, t.session.id)).toMatchObject(what === 'answers' ? { unsent: [0], finishSent: false } : { unsent: [], finishSent: false });
  await m.repo.sync(); expect(await m.store.get(owner, t.session.id)).toMatchObject({ unsent: [], finishSent: true });
});
for (const what of ['answers', 'finish'] as const) test(`${what}: потеря сети прерывает круг`, async () => {
  const m = make(); const { owner, t } = await seed(m, undefined, true);
  await m.store.put(owner, { ...t, session: { ...t.session, id: '00000000-0000-4000-8000-000000000101' }, startedAtMillis: NOW + 1 });
  m.api[what].mockRejectedValueOnce(fail(0, 'network')); await m.repo.sync(); expect(m.api[what]).toHaveBeenCalledTimes(1);
});
test('401 сохраняет очередь; повторный вход того же человека отправляет её', async () => {
  const m = make(); const { owner, t } = await seed(m); const unauthorized = vi.fn(); m.repo.setUnauthorizedHandler(unauthorized);
  m.api.answers.mockRejectedValueOnce(fail(401)); await m.repo.sync(); expect(unauthorized).toHaveBeenCalledTimes(1);
  await m.repo.sync(); expect(m.api.answers).toHaveBeenCalledTimes(1); expect(await m.store.get(owner, t.session.id)).toMatchObject({ unsent: [0] });
  await m.repo.signedIn('a'); await m.repo.sync(); expect(await m.store.get(owner, t.session.id)).toMatchObject({ unsent: [] });
});
test('после 401 вход другого человека удаляет очередь и сообщает потерянные ответы', async () => {
  const m = make(); await seed(m); m.api.answers.mockRejectedValueOnce(fail(401)); await m.repo.sync();
  await m.repo.signedIn('b'); await m.repo.sync(); expect(await m.repo.list()).toEqual([]); expect(m.api.answers).toHaveBeenCalledTimes(1);
  expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ message: 'training account changed: 1 unsent answers lost' }));
});
test('две вкладки используют настоящий Web Locks и отправляют один ответ один раз', async () => {
  const first = make(); await seed(first); const second = make(first.name); await second.repo.signedIn('a');
  await Promise.all([first.repo.sync(), second.repo.sync()]); expect(first.api.answers.mock.calls.length + second.api.answers.mock.calls.length).toBe(1);
});
test('новый выбор во время запроса остаётся в очереди', async () => {
  const m = make(); const { owner, t } = await seed(m); const held = deferred(), entered = deferred();
  m.api.answers.mockImplementationOnce(async () => { entered.resolve(); await held.promise; });
  const sending = m.repo.sync(); await entered.promise;
  await m.repo.answer(t.session.id, givenAnswer({ optionIds: ['B'] })); held.resolve(); await sending;
  expect(await m.store.get(owner, t.session.id)).toMatchObject({ answers: { 0: { optionIds: ['B'] } }, unsent: [0] });
  await m.repo.sync(); expect(await m.store.get(owner, t.session.id)).toMatchObject({ unsent: [] });
});
test('запрос повторной отправки во время круга запускает следующий круг', async () => {
  const m = make(); const { t } = await seed(m); const held = deferred(), entered = deferred(); m.auto.mockRestore();
  m.api.answers.mockImplementationOnce(async () => { entered.resolve(); await held.promise; });
  const first = m.repo.sync(); await entered.promise; await m.repo.answer(t.session.id, givenAnswer({ optionIds: ['B'] }));
  const second = m.repo.sync(); held.resolve(); await Promise.all([first, second]); expect(m.api.answers).toHaveBeenCalledTimes(2);
});
test('срок «Проверки» заканчивается на её сроке ближайшей отправкой', async () => {
  const m = make(); await m.repo.signedIn('a'); const owner = await m.store.signIn('a');
  const t = { ...savedTraining(), session: trainingSession({ mode: 'check', timeLimitSeconds: 90 }), startedAtMillis: NOW - 100_000 };
  await m.store.put(owner, t); expect(await m.repo.active()).toBeUndefined(); await m.repo.sync();
  expect(await m.store.get(owner, t.session.id)).toMatchObject({ finish: { finishedAt: new Date(NOW - 10_000).toISOString(), timedOut: true }, finishSent: true });
});
test('позиция и ответы сохраняются; конец нельзя переписать', async () => {
  const m = make(); const { t } = await seed(m);
  await m.repo.moveTo(t.session.id, 2); await m.repo.moveTo(t.session.id, -1); await m.repo.moveTo(t.session.id, 100);
  expect((await m.repo.get(t.session.id))?.position).toBe(2);
  await m.repo.finish(t.session.id, false); await m.repo.answer(t.session.id, givenAnswer({ optionIds: ['B'] })); await m.repo.finish(t.session.id, true);
  expect(await m.repo.get(t.session.id)).toMatchObject({ answers: { 0: { optionIds: ['A'] } }, finish: { timedOut: false } });
});
test('ответ вне сессии не добавляется, повторный выбор не дублирует позицию', async () => {
  const m = make(); const { t } = await seed(m); await m.repo.answer(t.session.id, givenAnswer({ position: 10 }));
  await m.repo.answer(t.session.id, givenAnswer()); expect((await m.repo.get(t.session.id))?.unsent).toEqual([0]);
});
test('выход во время старта и поздний 401 не затрагивают новый вход', async () => {
  const m = make(); await m.repo.signedIn('a'); const held = deferred();
  m.api.start.mockImplementationOnce(async () => { await held.promise; return trainingSession(); });
  const starting = m.repo.start({ ...request, questionTypes: [...request.questionTypes] }); await m.repo.signOut(); held.resolve();
  await expect(starting).rejects.toThrow('session changed'); expect(await m.repo.list()).toEqual([]);
  await m.repo.signedIn('a'); const heldError = deferred(); const unauthorized = vi.fn(); m.repo.setUnauthorizedHandler(unauthorized);
  m.api.options.mockImplementationOnce(async () => { await heldError.promise; throw fail(401); });
  const options = m.repo.options(); await m.repo.signedIn('b'); heldError.resolve(); await expect(options).rejects.toMatchObject({ status: 401 }); expect(unauthorized).not.toHaveBeenCalled();
});
test('смена владельца другой вкладкой во время запроса останавливает старую очередь', async () => {
  const m = make(); const { owner, t } = await seed(m); await m.store.put(owner, { ...t, session: { ...t.session, id: '00000000-0000-4000-8000-000000000101' } });
  const second = make(m.name); m.api.answers.mockImplementationOnce(async () => { await second.repo.signedIn('b'); });
  await m.repo.sync(); expect(m.api.answers).toHaveBeenCalledTimes(1); expect(await m.repo.list()).toEqual([]);
});
test('выход во время отправки не возвращает ответы', async () => {
  const m = make(); await seed(m); m.api.answers.mockImplementationOnce(async () => { await m.repo.signOut(); });
  await m.repo.sync(); await m.repo.signedIn('a'); expect(await m.repo.list()).toEqual([]);
});
test('ошибка записи при старте показывается вызывающему и сообщается без личных данных', async () => {
  const m = make(); await m.repo.signedIn('a'); vi.spyOn(m.store, 'put').mockRejectedValueOnce(new DOMException('private', 'QuotaExceededError'));
  await expect(m.repo.start({ ...request, questionTypes: [...request.questionTypes] })).rejects.toThrow('private');
  expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ message: 'training storage failed: QuotaExceededError' }));
});
test('ошибка сохранения действия не проглатывается', async () => {
  const m = make(); await seed(m); vi.spyOn(m.store, 'update').mockRejectedValueOnce(new Error('private'));
  await expect(m.repo.moveTo(trainingSession().id, 1)).rejects.toThrow('private');
});
test('неизвестный сбой и ответ не по договору оставляют тренировку, отправляя остальные', async () => {
  const m = make(); await seed(m); m.api.answers.mockRejectedValueOnce(new Error('private')); await m.repo.sync();
  m.api.answers.mockRejectedValueOnce(fail(200, 'contract')); await m.repo.sync();
  expect((await m.repo.get(trainingSession().id))?.unsent).toEqual([0]);
  m.api.options.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError')); await expect(m.repo.options()).rejects.toThrow('cancelled');
});
test('401 опций и отказ старта доходят до обработчика сессии', async () => {
  const m = make(); await m.repo.signedIn('a'); const unauthorized = vi.fn(); m.repo.setUnauthorizedHandler(unauthorized);
  m.api.options.mockRejectedValueOnce(fail(401)); await expect(m.repo.options()).rejects.toMatchObject({ status: 401 }); expect(unauthorized).toHaveBeenCalledTimes(1);
  await m.repo.signedIn('a'); m.api.start.mockRejectedValueOnce(fail(500)); await expect(m.repo.start({ ...request, questionTypes: [...request.questionTypes] })).rejects.toMatchObject({ status: 500 });
});


test('без Web Locks очередь остаётся на устройстве и сообщает причину', async () => {
  const m = make(undefined, null); await seed(m); await m.repo.sync();
  expect(m.api.answers).not.toHaveBeenCalled(); expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ message: 'training sync unavailable: Web Locks missing' }));
});
test('отказ записи из-за смены владельца не открывает тренировку', async () => {
  const m = make(); await m.repo.signedIn('a'); vi.spyOn(m.store, 'put').mockResolvedValueOnce(false);
  await expect(m.repo.start({ ...request, questionTypes: [...request.questionTypes] })).rejects.toThrow('owner changed');
});
test('неудача фоновой отправки сообщается, включая не-Error из внешнего вызова', async () => {
  const m = make(); await seed(m); m.auto.mockRestore(); vi.spyOn(m.store, 'list').mockRejectedValueOnce('external');
  m.repo.requestSync(); await expect.poll(() => m.report.mock.calls.length).toBe(1);
  expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ message: 'training storage failed: unknown' }));
});
test('из нескольких незавершённых «Продолжить» выбирает самую свежую', async () => {
  const m = make(); const { owner, t } = await seed(m);
  const newer = { ...t, session: { ...t.session, id: '00000000-0000-4000-8000-000000000101' }, startedAtMillis: NOW + 1 };
  await m.store.put(owner, newer); expect((await m.repo.active())?.session.id).toBe(newer.session.id);
});

test('неудача очистки не мешает выходу, а другой вход удаляет оставшееся', async () => {
  const m = make(); const { owner } = await seed(m); vi.spyOn(m.store, 'signOut').mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(m.repo.signOut()).resolves.toBeUndefined();
  expect(await m.repo.list()).toEqual([]);
  await m.repo.signedIn('b'); expect(await m.store.owns(owner)).toBe(false);
  expect(await m.repo.list()).toEqual([]);
  expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ message: 'training account changed: 1 unsent answers lost' }));
});

test('ответ между последним кругом и снятием Web Lock отправляется следующим кругом', async () => {
  let afterRound = async () => {};
  const locks: LockManager = {
    query: () => navigator.locks.query(),
    request: async <T,>(name: string, optionsOrCallback: LockOptions | LockGrantedCallback<T>, callback?: LockGrantedCallback<T>): Promise<T> => {
      if (typeof optionsOrCallback !== 'function') {
        if (!callback) throw new Error('missing lock callback');
        return navigator.locks.request(name, optionsOrCallback, callback);
      }
      return navigator.locks.request(name, async (lock) => {
        const result = await optionsOrCallback(lock);
        // IPC освобождения Web Lock ещё не закончилось, но обработчик последнего круга уже вернулся.
        await afterRound();
        return result;
      });
    },
  };
  const m = make(undefined, locks); const { t } = await seed(m); m.auto.mockRestore();
  afterRound = async () => { afterRound = async () => {}; await m.repo.answer(t.session.id, givenAnswer({ optionIds: ['B'] })); };
  await m.repo.sync();
  await expect.poll(() => m.api.answers.mock.calls.length).toBe(2);
  await expect.poll(async () => (await m.repo.get(t.session.id))?.unsent).toEqual([]);
});

test('черновик практики сохраняется; проверенный ответ, итог и проверка не перезаписываются черновиком', async () => {
  const { repo, store } = make(); await repo.signedIn('one');
  const owner = await store.currentOwner(); if (!owner) throw new Error('fixture owner');
  await store.put(owner, savedTraining());
  await repo.draft(trainingSession().id, 0, ['B']);
  expect((await repo.get(trainingSession().id))?.drafts?.['0']).toEqual(['B']);
  await repo.draft(trainingSession().id, 100, ['A']);
  await repo.answer(trainingSession().id, givenAnswer());
  await repo.draft(trainingSession().id, 0, ['A']);
  expect((await repo.get(trainingSession().id))?.drafts?.['0']).toEqual(['B']);
  await repo.finish(trainingSession().id, false);
  await repo.draft(trainingSession().id, 1, ['A']);
  expect((await repo.get(trainingSession().id))?.drafts?.['1']).toBeUndefined();
  await store.put(owner, { ...savedTraining(), session: trainingSession({ mode: 'check', timeLimitSeconds: 270 }) });
  await repo.draft(trainingSession().id, 0, ['A']);
  expect((await repo.get(trainingSession().id))?.drafts).toBeUndefined();
});

test('жалоба: ошибка устройства не теряет форму, выход во время запроса не возвращает очередь', async () => {
  const m = make(); await m.repo.signedIn('a');
  vi.spyOn(m.store, 'putReport').mockRejectedValueOnce(new DOMException(complaint.text, 'QuotaExceededError'));
  await expect(m.repo.recordReport(questionId, complaint)).rejects.toThrow();
  expect(m.repo.storageStatus()).toBe('ready');
  expect(m.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training storage failed: QuotaExceededError' }));
  await m.repo.recordReport(questionId, complaint);
  const entered = deferred(), held = deferred();
  m.api.report.mockImplementationOnce(async () => { entered.resolve(); await held.promise; });
  const sending = m.repo.sync(); await entered.promise; await m.repo.signOut(); held.resolve(); await sending;
  await m.repo.signedIn('a'); await m.repo.sync(); expect(m.api.report).toHaveBeenCalledTimes(1);
  await m.repo.signOut(); await expect(m.repo.recordReport(questionId, complaint)).rejects.toThrow('owner changed');
});


test('после фонового 401 жалоба записывается прежнему владельцу и ждёт повторного входа', async () => {
  const m = make(); const { owner } = await seed(m);
  m.api.answers.mockRejectedValueOnce(fail(401)); await m.repo.sync();
  await m.repo.recordReport(questionId, complaint);
  expect(await m.store.reports(owner)).toHaveLength(1);
  await m.repo.sync(); expect(m.api.report).not.toHaveBeenCalled();
  expect(m.report).not.toHaveBeenCalled();
  await m.repo.signedIn('a'); await m.repo.sync(); expect(m.api.report).toHaveBeenCalledExactlyOnceWith(questionId, complaint);
});

test('смена владельца жалобы не выдаёт ошибку хранилища и не пишет чужую очередь', async () => {
  const m = make(); await m.repo.signedIn('a'); await m.store.signIn('b');
  await expect(m.repo.recordReport(questionId, complaint)).rejects.toHaveProperty('name', 'TrainingOwnerChangedError');
  expect(m.report).not.toHaveBeenCalled();
  expect(await m.store.reports(await m.store.signIn('b'))).toEqual([]);
});


test('черновик жалобы: отказ диска, неизвестный владелец и утраченная запись различаются', async () => {
  const m = make(); await expect(m.repo.reportDraft(trainingSession().id, 0, { text: 'Synthetic' })).rejects.toHaveProperty('name', 'TrainingOwnerChangedError');
  const { owner } = await seed(m);
  await m.repo.reportDraft(trainingSession().id, 0, { kind: 'other' });
  await m.repo.reportDraft(trainingSession().id, 99, { kind: 'other' });
  expect((await m.store.get(owner, trainingSession().id))?.reportDrafts).toEqual({ 0: { kind: 'other' } });
  await m.repo.reportDraft(trainingSession().id, 0); expect((await m.store.get(owner, trainingSession().id))?.reportDrafts).toEqual({});
  const update = vi.spyOn(m.store, 'update').mockRejectedValueOnce(new DOMException('fixture', 'SecurityError'));
  await expect(m.repo.reportDraft(trainingSession().id, 0, {})).rejects.toHaveProperty('name', 'SecurityError');
  expect(m.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training storage failed: SecurityError' }));
  update.mockRestore();
  await expect(m.repo.reportDraft('missing', 0, {})).rejects.toHaveProperty('name', 'TrainingOwnerChangedError');
  await m.repo.signOut(); m.repo.retryStorage();
});
