import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { z } from 'zod';
import { reportError } from '../errors/report';
import { pendingReportSchema, reportDraftSchema, storedTrainingSchema, type PendingReport, type ReportDraft, type StoredTraining } from './model';

const ownerSchema = z.object({ userId: z.string().nullable(), revision: z.number().int().nonnegative() });
const changeSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('owner') }),
  z.object({ kind: z.literal('training'), ids: z.array(z.string()), activeChanged: z.boolean() }), z.object({ kind: z.literal('reports') })]);
export type TrainingChange = z.infer<typeof changeSchema> & { remote?: boolean };
export interface TrainingOwner { userId: string; revision: number }
interface TrainingDB extends DBSchema {
  trainings: { key: string; value: unknown };
  reports: { key: string; value: unknown };
  reportDrafts: { key: [string, number]; value: unknown };
  quarantine: { key: string; value: unknown };
  meta: { key: string; value: unknown };
}
type Edit = IDBPTransaction<TrainingDB, ['trainings', 'reports', 'reportDrafts', 'quarantine', 'meta'], 'readwrite'>;
const stores: ['trainings', 'reports', 'reportDrafts', 'quarantine', 'meta'] = ['trainings', 'reports', 'reportDrafts', 'quarantine', 'meta'];
const KEEP_FINISHED = 3;

export class TrainingStorageBlockedError extends Error {
  constructor() { super('training database upgrade blocked'); this.name = 'TrainingStorageBlockedError'; }
}
export class TrainingMissingError extends Error {
  constructor() { super('training record missing'); this.name = 'TrainingMissingError'; }
}
export class TrainingOwnerChangedError extends Error {
  constructor() { super('training report not saved: owner changed'); this.name = 'TrainingOwnerChangedError'; }
}

/** Поздняя запись и другая вкладка не возвращают данные после выхода: каждая операция сверяет владельца. */
export class TrainingStore {
  private db: Promise<IDBPDatabase<TrainingDB>> | undefined;
  private listeners = new Set<(change: TrainingChange) => void>();
  private channel: BroadcastChannel;

  constructor(private name = 'greprep-trainings', private report: (e: unknown) => void = reportError) {
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = (event: MessageEvent<unknown>) => {
      const parsed = changeSchema.safeParse(event.data);
      if (parsed.success) this.emit({ ...parsed.data, remote: true });
    };
  }

  private open() {
    if (this.db) return this.db;
    let blocked = false;
    let rejectBlocked: (error: Error) => void = () => {};
    const blockedRequest = new Promise<never>((_resolve, reject) => { rejectBlocked = reject; });
    const opening = openDB<TrainingDB>(this.name, 3, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) { db.createObjectStore('trainings'); db.createObjectStore('quarantine'); db.createObjectStore('meta'); }
        if (oldVersion < 2) db.createObjectStore('reports');
        if (oldVersion < 3) {
          db.createObjectStore('reportDrafts');
          // Перенос и удаление прежнего поля атомарны с обновлением схемы.
          void (async () => {
            let cursor = await tx.objectStore('trainings').openCursor();
            while (cursor) {
              const legacy = z.object({ reportDrafts: z.record(z.string(), z.unknown()).optional() }).safeParse(cursor.value);
              const training = storedTrainingSchema.safeParse(cursor.value);
              if (legacy.success && legacy.data.reportDrafts && training.success) {
                for (const [position, raw] of Object.entries(legacy.data.reportDrafts)) {
                  const draft = reportDraftSchema.safeParse(raw);
                  if (draft.success && (draft.data.kind || draft.data.text) && training.data.session.items.some((item) => String(item.position) === position)) {
                    await tx.objectStore('reportDrafts').put(draft.data, [cursor.key, Number(position)]);
                  }
                }
                await cursor.update(training.data);
              }
              cursor = await cursor.continue();
            }
          })().catch(() => {
            // Ошибка миграции отклонит openDB через abort: частичный перенос не принимаем.
            tx.abort();
          });
        }
      },
      blocked() { blocked = true; rejectBlocked(new TrainingStorageBlockedError()); },
      blocking: () => {
        void opening.then((db) => { db.close(); if (this.db === cached) this.db = undefined; });
      },
    });
    // Запрос IndexedDB нельзя отменить. После blocked он ещё откроется: закрываем позднее соединение.
    const available = opening.then((db) => { if (blocked) db.close(); return db; });
    const cached = Promise.race([available, blockedRequest]).catch((error: unknown) => {
      if (this.db === cached) this.db = undefined;
      throw error;
    });
    this.db = cached;
    return cached;
  }
  subscribe = (listener: (change: TrainingChange) => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private emit(change: TrainingChange) { for (const listener of this.listeners) listener(change); }
  private changed(change: TrainingChange) { this.emit(change); this.channel.postMessage(change); }
  async close() { this.channel.close(); this.listeners.clear(); (await this.db)?.close(); }

  async signIn(userId: string): Promise<TrainingOwner> {
    const tx = (await this.open()).transaction(stores, 'readwrite');
    const raw = await tx.objectStore('meta').get('owner');
    const parsed = ownerSchema.optional().safeParse(raw);
    const old = parsed.success ? parsed.data : undefined;
    if (old?.userId === userId) { await tx.done; return { userId, revision: old.revision }; }
    const lost = (await tx.objectStore('trainings').getAll()).reduce<number>((sum, record) => {
      const pending = z.object({ unsent: z.array(z.number()) }).safeParse(record);
      return sum + (pending.success ? pending.data.unsent.length : 0);
    }, 0);
    const lostReports = await tx.objectStore('reports').count();
    await tx.objectStore('reports').clear();
    await tx.objectStore('reportDrafts').clear();
    await tx.objectStore('trainings').clear();
    await tx.objectStore('quarantine').clear();
    // Нечитаемая ревизия не должна случайно совпасть с прежней ревизией открытой вкладки.
    const owner = { userId, revision: parsed.success ? (old?.revision ?? 0) + 1 : Date.now() };
    await tx.objectStore('meta').put(owner, 'owner');
    await tx.done;
    if (!parsed.success) this.report(new Error('training owner unreadable'));
    if (lost > 0) this.report(new Error(`training account changed: ${lost} unsent answers lost`));
    if (lostReports > 0) this.report(new Error(`training account changed: ${lostReports} unsent reports lost`));
    this.changed({ kind: 'owner' });
    return owner;
  }

  async currentOwner(): Promise<TrainingOwner | undefined> {
    const tx = (await this.open()).transaction('meta', 'readonly');
    const parsed = ownerSchema.safeParse(await tx.store.get('owner'));
    await tx.done;
    return parsed.success && parsed.data.userId !== null ? { userId: parsed.data.userId, revision: parsed.data.revision } : undefined;
  }
  async owns(owner: TrainingOwner): Promise<boolean> {
    const current = await this.currentOwner();
    return current?.userId === owner.userId && current.revision === owner.revision;
  }
  private matches(raw: unknown, owner: TrainingOwner) {
    const current = ownerSchema.safeParse(raw);
    return current.success && current.data.userId === owner.userId && current.data.revision === owner.revision;
  }
  private async edit<T>(owner: TrainingOwner, action: (tx: Edit) => Promise<T>): Promise<T | undefined> {
    const tx = (await this.open()).transaction(stores, 'readwrite');
    if (!this.matches(await tx.objectStore('meta').get('owner'), owner)) { await tx.done; return undefined; }
    let result: T;
    try { result = await action(tx); }
    catch (error) {
      // Исключение JS само не откатывает IndexedDB: уже записанная очередь иначе переживёт отказ удаления.
      if (!tx.error) tx.abort();
      return tx.done.then(() => { throw error; }, () => { throw error; });
    }
    await tx.done;
    return result;
  }
  private key(owner: TrainingOwner, id: string) { return `${owner.userId}/${id}`; }

  async signOut(owner: TrainingOwner): Promise<void> {
    const cleared = await this.edit(owner, async (tx) => {
      await tx.objectStore('trainings').clear();
      await tx.objectStore('reports').clear();
      await tx.objectStore('reportDrafts').clear();
      await tx.objectStore('quarantine').clear();
      await tx.objectStore('meta').put({ userId: null, revision: owner.revision + 1 }, 'owner');
      return true;
    });
    if (cleared) this.changed({ kind: 'owner' });
  }

  /** Обычное чтение не мешает соседним вкладкам. Карантин — отдельная запись с повторной проверкой. */
  private async quarantine(owner: TrainingOwner, keys: string[]) {
    if (keys.length === 0) return;
    const removed = await this.edit(owner, async (tx) => {
      const ids: string[] = [];
      for (const key of keys) {
        const raw = await tx.objectStore('trainings').get(key);
        if (raw === undefined || storedTrainingSchema.safeParse(raw).success) continue;
        await tx.objectStore('quarantine').put(raw, key);
        await tx.objectStore('trainings').delete(key);
        ids.push(key.slice(owner.userId.length + 1));
      }
      return ids;
    });
    if (removed?.length) {
      for (const _id of removed) this.report(new Error('training record unreadable: invalid stored training'));
      this.changed({ kind: 'training', ids: removed, activeChanged: true });
    }
  }

  async get(owner: TrainingOwner, id: string): Promise<StoredTraining | undefined> {
    const tx = (await this.open()).transaction(['trainings', 'meta'], 'readonly');
    if (!this.matches(await tx.objectStore('meta').get('owner'), owner)) { await tx.done; return undefined; }
    const key = this.key(owner, id);
    const raw = await tx.objectStore('trainings').get(key);
    await tx.done;
    if (raw === undefined) return undefined;
    const parsed = storedTrainingSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    await this.quarantine(owner, [key]);
    return undefined;
  }

  async list(owner: TrainingOwner): Promise<StoredTraining[]> {
    const tx = (await this.open()).transaction(['trainings', 'meta'], 'readonly');
    if (!this.matches(await tx.objectStore('meta').get('owner'), owner)) { await tx.done; return []; }
    const [keys, records] = await Promise.all([tx.objectStore('trainings').getAllKeys(), tx.objectStore('trainings').getAll()]);
    await tx.done;
    const all: StoredTraining[] = [], invalid: string[] = [];
    records.forEach((raw, index) => {
      const parsed = storedTrainingSchema.safeParse(raw);
      if (parsed.success) all.push(parsed.data); else if (keys[index] !== undefined) invalid.push(keys[index]);
    });
    await this.quarantine(owner, invalid);
    return all;
  }

  async put(owner: TrainingOwner, training: StoredTraining): Promise<boolean> {
    const checked = storedTrainingSchema.parse(training);
    const written = await this.edit(owner, async (tx) => {
      await tx.objectStore('trainings').put(checked, this.key(owner, checked.session.id));
      return true;
    });
    if (written) this.changed({ kind: 'training', ids: [checked.session.id], activeChanged: true });
    return written ?? false;
  }

  async update(owner: TrainingOwner, id: string, change: (t: StoredTraining) => StoredTraining): Promise<boolean> {
    const result = await this.edit(owner, async (tx) => {
      const raw = await tx.objectStore('trainings').get(this.key(owner, id));
      const parsed = storedTrainingSchema.safeParse(raw);
      if (!parsed.success) return undefined;
      const next = storedTrainingSchema.parse(change(parsed.data));
      const changed = JSON.stringify(parsed.data) !== JSON.stringify(next);
      if (changed) await tx.objectStore('trainings').put(next, this.key(owner, id));
      return { changed, activeChanged: Boolean(parsed.data.finish) !== Boolean(next.finish) };
    });
    if (result?.changed) this.changed({ kind: 'training', ids: [id], activeChanged: result.activeChanged });
    return result !== undefined;
  }

  async prune(owner: TrainingOwner): Promise<void> {
    const all = (await this.list(owner)).sort((a, b) => b.startedAtMillis - a.startedAtMillis);
    const finished = all.filter((t) => t.finish && t.finishSent && t.unsent.length === 0).slice(KEEP_FINISHED);
    const abandoned = all.filter((t) => !t.finish).slice(1).filter((t) => t.unsent.length === 0);
    const removed = await this.edit(owner, async (tx) => {
      const ids: string[] = [];
      for (const candidate of [...finished, ...abandoned]) {
        const parsed = storedTrainingSchema.safeParse(await tx.objectStore('trainings').get(this.key(owner, candidate.session.id)));
        if (!parsed.success || parsed.data.unsent.length > 0 || (parsed.data.finish && !parsed.data.finishSent)) continue;
        await tx.objectStore('trainings').delete(this.key(owner, candidate.session.id));
        ids.push(candidate.session.id);
      }
      // Подбираем также черновики записей, пропавших между вкладками или попавших в карантин.
      for (const key of await tx.objectStore('reportDrafts').getAllKeys()) {
        if (await tx.objectStore('trainings').getKey(key[0]) === undefined) await tx.objectStore('reportDrafts').delete(key);
      }
      return ids;
    });
    if (removed?.length) this.changed({ kind: 'training', ids: removed, activeChanged: true });
  }

  async getReportDraft(owner: TrainingOwner, id: string, position: number): Promise<ReportDraft | undefined> {
    const tx = (await this.open()).transaction(['reportDrafts', 'meta'], 'readonly');
    if (!this.matches(await tx.objectStore('meta').get('owner'), owner)) { await tx.done; return undefined; }
    const key: [string, number] = [this.key(owner, id), position];
    const raw = await tx.objectStore('reportDrafts').get(key);
    await tx.done;
    if (raw === undefined) return undefined;
    const parsed = reportDraftSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    await this.edit(owner, async (tx) => { await tx.objectStore('reportDrafts').delete(key); });
    this.report(new Error('training report draft unreadable'));
    return undefined;
  }

  async putReportDraft(owner: TrainingOwner, id: string, position: number, draft?: ReportDraft): Promise<boolean> {
    const checked = draft === undefined ? undefined : reportDraftSchema.parse(draft);
    const saved = await this.edit(owner, async (tx) => {
      const key: [string, number] = [this.key(owner, id), position];
      if (!checked?.kind && !checked?.text) { await tx.objectStore('reportDrafts').delete(key); return true; }
      const training = storedTrainingSchema.safeParse(await tx.objectStore('trainings').get(key[0]));
      if (!training.success) return false;
      if (training.data.session.items[position]) await tx.objectStore('reportDrafts').put(checked, key);
      return true;
    });
    // Черновик не меняет тренировку: не будим её запросы и активный экран на вводе.
    return saved ?? false;
  }

  async putReport(owner: TrainingOwner, pending: PendingReport, position?: number): Promise<boolean> {
    const checked = pendingReportSchema.parse(pending);
    const saved = await this.edit(owner, async (tx) => {
      const previous = z.number().int().nonnegative().optional().parse(await tx.objectStore('meta').get('reportOrder')) ?? 0;
      await tx.objectStore('reports').put({ ...checked, order: previous + 1 }, this.key(owner, checked.id));
      await tx.objectStore('meta').put(previous + 1, 'reportOrder');
      if (checked.report.trainingId && position !== undefined) {
        await tx.objectStore('reportDrafts').delete([this.key(owner, checked.report.trainingId), position]);
      }
      return true;
    });
    if (saved) this.changed({ kind: 'reports' });
    return saved ?? false;
  }

  async reports(owner: TrainingOwner): Promise<PendingReport[]> {
    const tx = (await this.open()).transaction(['reports', 'meta'], 'readonly');
    if (!this.matches(await tx.objectStore('meta').get('owner'), owner)) { await tx.done; return []; }
    const [keys, records] = await Promise.all([tx.objectStore('reports').getAllKeys(), tx.objectStore('reports').getAll()]);
    await tx.done;
    const valid: PendingReport[] = [], invalid: string[] = [];
    records.forEach((raw, index) => {
      const parsed = pendingReportSchema.safeParse(raw);
      if (parsed.success) valid.push(parsed.data); else if (keys[index] !== undefined) invalid.push(keys[index]);
    });
    if (invalid.length) await this.edit(owner, async (tx) => {
      for (const key of invalid) {
        const raw = await tx.objectStore('reports').get(key);
        if (raw === undefined || pendingReportSchema.safeParse(raw).success) continue;
        await tx.objectStore('quarantine').put(raw, `report/${key}`);
        await tx.objectStore('reports').delete(key);
        this.report(new Error('training report unreadable'));
      }
    });
    return valid.sort((a, b) => a.order - b.order);
  }

  async removeReport(owner: TrainingOwner, id: string): Promise<void> {
    await this.edit(owner, async (tx) => { await tx.objectStore('reports').delete(this.key(owner, id)); });
  }
}
