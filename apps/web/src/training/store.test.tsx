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
