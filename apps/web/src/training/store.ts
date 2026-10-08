import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { z } from 'zod';
import { reportError } from '../errors/report';
import { storedTrainingSchema, type StoredTraining } from './model';

const ownerSchema = z.object({ userId: z.string().nullable(), revision: z.number().int() });
export interface TrainingOwner { userId: string; revision: number }
interface TrainingDB extends DBSchema {
  trainings: { key: string; value: unknown };
  quarantine: { key: string; value: unknown };
  meta: { key: string; value: unknown };
}
type Edit = IDBPTransaction<TrainingDB, ['trainings', 'quarantine', 'meta'], 'readwrite'>;
const stores: ['trainings', 'quarantine', 'meta'] = ['trainings', 'quarantine', 'meta'];
const KEEP_FINISHED = 3;

/** Транзакция всегда проверяет владельца: поздняя запись и другая вкладка не возвращают данные после выхода. */
export class TrainingStore {
  private db: Promise<IDBPDatabase<TrainingDB>> | undefined;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel;

  constructor(private name = 'greprep-trainings', private report: (e: unknown) => void = reportError) {
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = () => this.emit();
  }

  private open() {
    this.db ??= openDB<TrainingDB>(this.name, 1, {
      upgrade(db) { db.createObjectStore('trainings'); db.createObjectStore('quarantine'); db.createObjectStore('meta'); },
    });
    return this.db;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private emit() { for (const listener of this.listeners) listener(); }
  private changed() { this.emit(); this.channel.postMessage('changed'); }

  async close() { this.channel.close(); (await this.db)?.close(); }

  async signIn(userId: string): Promise<TrainingOwner> {
    const db = await this.open();
    const tx = db.transaction(stores, 'readwrite');
    const old = ownerSchema.optional().parse(await tx.objectStore('meta').get('owner'));
    if (old?.userId === userId) { await tx.done; return { userId, revision: old.revision }; }
    // Смена аккаунта уничтожает также карантин. В отчёт попадает только число потерянных ответов.
    const lost = (await tx.objectStore('trainings').getAll()).reduce<number>((sum, raw) => {
      const parsed = z.object({ unsent: z.array(z.number()) }).safeParse(raw);
      return sum + (parsed.success ? parsed.data.unsent.length : 0);
    }, 0);
    await tx.objectStore('trainings').clear();
    await tx.objectStore('quarantine').clear();
    const owner = { userId, revision: (old?.revision ?? 0) + 1 };
    await tx.objectStore('meta').put(owner, 'owner');
    await tx.done;
    if (lost > 0) this.report(new Error(`training account changed: ${lost} unsent answers lost`));
    this.changed();
    return owner;
  }

  async signOut(owner: TrainingOwner): Promise<void> {
    await this.edit(owner, async (tx) => {
      await tx.objectStore('trainings').clear();
      await tx.objectStore('quarantine').clear();
      await tx.objectStore('meta').put({ userId: null, revision: owner.revision + 1 }, 'owner');
    });
  }

  private async matches(tx: Edit, owner: TrainingOwner) {
    const current = ownerSchema.optional().parse(await tx.objectStore('meta').get('owner'));
    return current?.userId === owner.userId && current.revision === owner.revision;
  }

  async owns(owner: TrainingOwner): Promise<boolean> {
    const tx = (await this.open()).transaction(stores, 'readwrite');
    const matches = await this.matches(tx, owner);
    await tx.done;
    return matches;
  }

  private async edit<T>(owner: TrainingOwner, action: (tx: Edit) => Promise<T>, notify = true): Promise<T | undefined> {
    const tx = (await this.open()).transaction(stores, 'readwrite');
    if (!await this.matches(tx, owner)) { await tx.done; return undefined; }
    const result = await action(tx);
    await tx.done;
    if (notify) this.changed();
    return result;
  }

  private key(owner: TrainingOwner, id: string) { return `${owner.userId}/${id}`; }

  private async read(tx: Edit, key: string): Promise<StoredTraining | undefined> {
    const raw = await tx.objectStore('trainings').get(key);
    if (raw === undefined) return undefined;
    const parsed = storedTrainingSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    await tx.objectStore('quarantine').put(raw, key);
    await tx.objectStore('trainings').delete(key);
    this.report(new Error('training record unreadable: invalid stored training'));
    return undefined;
  }

  async get(owner: TrainingOwner, id: string): Promise<StoredTraining | undefined> {
    return this.edit(owner, (tx) => this.read(tx, this.key(owner, id)), false);
  }

  async list(owner: TrainingOwner): Promise<StoredTraining[]> {
    return await this.edit(owner, async (tx) => {
      const all: StoredTraining[] = [];
      for (const key of await tx.objectStore('trainings').getAllKeys()) {
        const t = await this.read(tx, key);
        if (t) all.push(t);
      }
      return all;
    }, false) ?? [];
  }

  async put(owner: TrainingOwner, training: StoredTraining): Promise<boolean> {
    const checked = storedTrainingSchema.parse(training);
    return await this.edit(owner, async (tx) => {
      await tx.objectStore('trainings').put(checked, this.key(owner, checked.session.id));
      return true;
    }) ?? false;
  }

  async update(owner: TrainingOwner, id: string, change: (t: StoredTraining) => StoredTraining): Promise<void> {
    await this.edit(owner, async (tx) => {
      const key = this.key(owner, id);
      const current = await this.read(tx, key);
      if (current) await tx.objectStore('trainings').put(storedTrainingSchema.parse(change(current)), key);
    });
  }

  async prune(owner: TrainingOwner): Promise<void> {
    await this.edit(owner, async (tx) => {
      const all: StoredTraining[] = [];
      for (const key of await tx.objectStore('trainings').getAllKeys()) {
        const t = await this.read(tx, key);
        if (t) all.push(t);
      }
      all.sort((a, b) => b.startedAtMillis - a.startedAtMillis);
      const finished = all.filter((t) => t.finish && t.finishSent && t.unsent.length === 0).slice(KEEP_FINISHED);
      const abandoned = all.filter((t) => !t.finish).slice(1).filter((t) => t.unsent.length === 0);
      for (const t of [...finished, ...abandoned]) await tx.objectStore('trainings').delete(this.key(owner, t.session.id));
    });
  }
}
