import { deleteDB, openDB } from 'idb';
import { afterEach, expect, test, vi } from 'vitest';
import { savedTraining } from '../test/training';
import { TrainingStore } from './store';

const opened: { name: string; store: TrainingStore }[] = [];
const makeStore = (name = `training-test-${crypto.randomUUID()}`) => {
  const report = vi.fn(); const store = new TrainingStore(name, report); opened.push({ name, store }); return { store, report, name };
};
afterEach(async () => { for (const { store } of opened) await store.close(); for (const name of new Set(opened.map((s) => s.name))) await deleteDB(name); opened.length = 0; });

test('IndexedDB помнит владельца и полную тренировку после перезапуска', async () => {
  const { store, name } = makeStore();
  const owner = await store.signIn('user-a'); const t = savedTraining(); await store.put(owner, t);
  const restarted = makeStore(name).store;
  expect(await restarted.signIn('user-a')).toEqual(owner);
  expect(await restarted.get(owner, t.session.id)).toEqual(t);
  expect(await restarted.list(owner)).toEqual([t]);
});
test('смена пользователя стирает всё и сообщает число потерянных ответов без содержания', async () => {
  const { store, report, name } = makeStore(); const a = await store.signIn('a');
  const t = savedTraining();
  await store.put(a, t);
  await store.update(a, t.session.id, (t) => ({ ...t, answers: { 0: { position: 0, optionIds: ['A'], dontKnow: false, flagged: false, answeredAt: '2026-10-06T09:01:00Z', elapsedMs: 0 } }, unsent: [0] }));
  const db = await openDB(name); await db.put('quarantine', { secret: 'не в отчёт' }, 'a/broken'); db.close();
  const b = await store.signIn('b');
  expect(await store.list(b)).toEqual([]); expect(await store.list(a)).toEqual([]);
  expect(await store.put(a, t)).toBe(false); expect(await store.get(a, t.session.id)).toBeUndefined();
  await store.update(a, t.session.id, (t) => t); await store.prune(a); await store.signOut(a);
  expect(await store.owns(b)).toBe(true);
  expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training account changed: 1 unsent answers lost' }));
  const inspected = await openDB(name); expect(await inspected.count('quarantine')).toBe(0); inspected.close();
});
test('выход стирает ответы и карантин, поздняя запись не возвращает их', async () => {
  const { store, report, name } = makeStore(); const owner = await store.signIn('a'); const t = savedTraining(); await store.put(owner, t);
  const db = await openDB(name); await db.put('quarantine', 'broken', 'a/broken'); db.close();
  await store.signOut(owner);
  expect(await store.put(owner, t)).toBe(false); expect(await store.owns(owner)).toBe(false);
  expect(await store.list(await store.signIn('a'))).toEqual([]); expect(report).not.toHaveBeenCalled();
  const inspected = await openDB(name); expect(await inspected.count('quarantine')).toBe(0); inspected.close();
});
test('нечитаемая запись откладывается в сторону и сообщается один раз', async () => {
  const { store, report, name } = makeStore(); const owner = await store.signIn('a');
  const db = await openDB(name); await db.put('trainings', { unsent: [0], bad: 'private' }, 'a/broken'); db.close();
  expect(await store.list(owner)).toEqual([]); expect(await store.list(owner)).toEqual([]);
  expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training record unreadable: invalid stored training' }));
  const inspected = await openDB(name); expect(await inspected.get('quarantine', 'a/broken')).toEqual({ unsent: [0], bad: 'private' }); inspected.close();
});
test('битые позиции и несуществующие неотправленные ответы не принимаются', async () => {
  const { store } = makeStore(); const owner = await store.signIn('a'); const t = savedTraining();
  await expect(store.put(owner, { ...t, unsent: [2] })).rejects.toThrow('invalid stored positions');
  await expect(store.put(owner, { ...t, position: 9 })).rejects.toThrow('invalid stored positions');
  await expect(store.put(owner, { ...t, session: { ...t.session, items: t.session.items.map((item) => ({ ...item, position: 9 })) } })).rejects.toThrow('invalid stored positions');
  await expect(store.put(owner, { ...t, answers: { 2: { position: 0, optionIds: [], dontKnow: false, flagged: false, elapsedMs: 0, answeredAt: '2026-10-06T09:01:00Z' } } })).rejects.toThrow('invalid stored positions');
  await expect(store.put(owner, { ...t, answers: { '00': { position: 0, optionIds: [], dontKnow: false, flagged: false, elapsedMs: 0, answeredAt: '2026-10-06T09:01:00Z' } } })).rejects.toThrow('invalid stored positions');
  await store.update(owner, 'absent', (t) => t);
  expect(await store.get(owner, 'absent')).toBeUndefined();
});
test('уборка оставляет три отправленных итога и последнюю незавершённую, не теряя очередь', async () => {
  const { store } = makeStore(); const owner = await store.signIn('a');
  for (let index = 1; index <= 6; index++) {
    const t = savedTraining(`00000000-0000-4000-8000-00000000010${index}`, index);
    await store.put(owner, { ...t, finish: { finishedAt: '2026-10-06T10:00:00Z', timedOut: false }, finishSent: index !== 1 });
  }
  await store.put(owner, savedTraining('00000000-0000-4000-8000-000000000111', 11));
  await store.put(owner, savedTraining('00000000-0000-4000-8000-000000000112', 12));
  await store.prune(owner);
  expect((await store.list(owner)).map((t) => t.session.id.slice(-3))).toEqual(['101', '104', '105', '106', '112']);
});
test('уведомления своей и второй вкладки приходят только от изменения', async () => {
  const { store, name } = makeStore(); const second = makeStore(name).store;
  const local = vi.fn(), remote = vi.fn(); const off = store.subscribe(local), off2 = second.subscribe(remote);
  const owner = await store.signIn('a'); await expect.poll(() => remote.mock.calls.length).toBe(1);
  await store.list(owner); await store.get(owner, 'absent'); expect(local).toHaveBeenCalledTimes(1);
  off(); off2(); await store.put(owner, savedTraining()); expect(local).toHaveBeenCalledTimes(1);
});
test('до входа чужой владелец ничего не читает', async () => {
  const { store } = makeStore(); expect(await store.owns({ userId: 'a', revision: 1 })).toBe(false);
});

test('испорченный meta.owner очищается как неизвестный владелец и больше не мешает входу', async () => {
  const { store, name, report } = makeStore(); const owner = await store.signIn('a');
  await store.put(owner, savedTraining());
  const db = await openDB(name); await db.put('meta', { userId: 'private', revision: 'broken' }, 'owner'); db.close();
  const next = await store.signIn('a');
  expect(await store.list(next)).toEqual([]);
  expect(await store.owns(owner)).toBe(false);
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'training owner unreadable' }));
  expect(await store.signIn('a')).toEqual(next);
});

test('чтение тренировок и владельца не захватывает транзакцию записи', async () => {
  const { store } = makeStore(); const owner = await store.signIn('a'); const t = savedTraining(); await store.put(owner, t);
  const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
  await store.get(owner, t.session.id); await store.list(owner); await store.owns(owner);
  expect(transaction.mock.calls.every((call) => call[1] === 'readonly')).toBe(true);
});

test('ошибка открытия базы не запоминается навсегда; после восстановления устройство доступно', async () => {
  const { store, name } = makeStore();
  const newer = await openDB(name, 3); newer.close();
  await expect(store.signIn('a')).rejects.toHaveProperty('name', 'VersionError');
  await deleteDB(name);
  const owner = await store.signIn('a'); expect(await store.owns(owner)).toBe(true);
});

test('get переносит нечитаемую запись отдельной транзакцией и смена пользователя удаляет её', async () => {
  const { store, name, report } = makeStore(); const owner = await store.signIn('a');
  const db = await openDB(name); await db.put('trainings', 'private', 'a/broken'); db.close();
  expect(await store.get(owner, 'broken')).toBeUndefined();
  expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training record unreadable: invalid stored training' }));
  const again = await openDB(name); await again.put('trainings', 'private', 'a/invalid'); again.close();
  const next = await store.signIn('b'); expect(await store.list(next)).toEqual([]);
  expect(report).not.toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('private') }));
});

test('обновление IndexedDB 1 → 2 сохраняет владельца и тренировку', async () => {
  const name = `training-migration-${crypto.randomUUID()}`;
  const db = await openDB(name, 1, { upgrade(db) { db.createObjectStore('trainings'); db.createObjectStore('quarantine'); db.createObjectStore('meta'); } });
  const t = savedTraining();
  await db.put('meta', { userId: 'a', revision: 1 }, 'owner'); await db.put('trainings', t, `a/${t.session.id}`); db.close();
  const { store } = makeStore(name); const owner = await store.signIn('a');
  expect(await store.get(owner, t.session.id)).toEqual(t); expect(await store.reports(owner)).toEqual([]);
});

test('жалобы: нечитаемое из очереди в карантин без содержания, чужой владелец не читает и не пишет', async () => {
  const { store, name, report } = makeStore(); const owner = await store.signIn('a');
  const pending = { id: crypto.randomUUID(), questionId: crypto.randomUUID(), report: { kind: 'other' as const }, order: 0 };
  await store.putReport(owner, pending);
  const db = await openDB(name); await db.put('reports', { text: 'private fixture' }, 'a/broken'); db.close();
  expect(await store.reports(owner)).toHaveLength(1); await store.reports(owner);
  expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training report unreadable' }));
  const next = await store.signIn('b');
  expect(await store.reports(owner)).toEqual([]); expect(await store.putReport(owner, pending)).toBe(false);
  await store.removeReport(owner, pending.id); expect(await store.reports(next)).toEqual([]);
});


test('заблокированное обновление не висит: повтор после закрытия старой вкладки сохраняет данные', async () => {
  const { store, name } = makeStore();
  const old = await openDB(name, 1, { upgrade(db) { for (const key of ['trainings', 'quarantine', 'meta']) db.createObjectStore(key); } });
  const t = savedTraining(); await old.put('meta', { userId: 'a', revision: 1 }, 'owner'); await old.put('trainings', t, `a/${t.session.id}`);
  let failure: unknown;
  const opening = store.signIn('a').catch((error: unknown) => { failure = error; });
  try { await expect.poll(() => failure instanceof Error ? failure.name : undefined).toBe('TrainingStorageBlockedError'); }
  finally { old.close(); await opening; }
  const owner = await store.signIn('a');
  expect(await store.get(owner, t.session.id)).toEqual(t);
});

test('versionchange закрывает соединение старой сборки и позволяет следующую миграцию', async () => {
  const { store, name } = makeStore(); await store.signIn('a');
  let upgraded = false;
  const updating = openDB(name, 3, { upgrade() { upgraded = true; } });
  try { await expect.poll(() => upgraded).toBe(true); }
  finally { await store.close(); (await updating).close(); }
});

test('миграция с версии 2 на 3 не создаёт reports повторно', async () => {
  const { store, name } = makeStore(); const owner = await store.signIn('a'); const training = savedTraining(); await store.put(owner, training); await store.close();
  const original = indexedDB.open.bind(indexedDB);
  const opening = vi.spyOn(indexedDB, 'open').mockImplementation((database, version) => original(database, database === name && version === 2 ? 3 : version));
  try {
    const next = makeStore(name).store;
    expect(await next.signIn('a')).toEqual(owner);
    expect(await next.get(owner, training.session.id)).toEqual(training);
  } finally { opening.mockRestore(); }
});


test('очередь жалобы и удаление черновика атомарны, уборка сохраняет оставшиеся черновики', async () => {
  const { store } = makeStore(); const owner = await store.signIn('a'); const t = savedTraining();
  const draft = { kind: 'other' as const, text: 'Synthetic draft' };
  await store.put(owner, { ...t, reportDrafts: { 0: draft, 1: draft }, finish: { finishedAt: '2026-10-06T10:00:00Z', timedOut: false }, finishSent: true });
  for (let i = 1; i <= 4; i++) await store.put(owner, { ...savedTraining(`00000000-0000-4000-8000-00000000020${i}`, t.startedAtMillis + i), finish: t.finish ?? { finishedAt: '2026-10-06T10:00:00Z', timedOut: false }, finishSent: true });
  await store.prune(owner); expect((await store.get(owner, t.session.id))?.reportDrafts).toEqual({ 0: draft, 1: draft });
  await store.putReport(owner, { id: crypto.randomUUID(), questionId: t.session.items[0]!.question.id, report: { kind: 'other', trainingId: t.session.id }, order: 0 }, 0);
  expect((await store.get(owner, t.session.id))?.reportDrafts).toEqual({ 1: draft });
  expect(await store.reports(owner)).toHaveLength(1);
  await store.signOut(owner); expect(await store.get(owner, t.session.id)).toBeUndefined();
});
