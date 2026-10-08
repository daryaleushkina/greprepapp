import { ApiError, getTrainingOptions, startTraining, submitTrainingAnswers, finishTraining, schemas, type GivenAnswer, type TrainingRequest } from '@greprep/api-client';
import { reportError } from '../errors/report';
import { storedTraining, type StoredTraining } from './model';
import { TrainingRules } from './rules';
import { TrainingStore, type TrainingOwner } from './store';

export const SUPPORTED_TYPES = schemas.QuestionType.options;
const PERMANENT = new Set([400, 404, 409, 410, 422]);
export const SYNC_LOCK = 'greprep-training-sync';
interface TrainingApi {
  options: typeof getTrainingOptions;
  start: typeof startTraining;
  answers: typeof submitTrainingAnswers;
  finish: typeof finishTraining;
}
const TRAINING_API: TrainingApi = { options: getTrainingOptions, start: startTraining, answers: submitTrainingAnswers, finish: finishTraining };

/** Одна отправка на все вкладки. Под замком данные перечитываются из IndexedDB, поэтому второй круг не дублирует первый. */
export class TrainingRepository {
  private owner: TrainingOwner | undefined;
  private authenticated = false;
  private generation = 0;
  private running: Promise<void> | undefined;
  private again = false;
  private unauthorized: (error: ApiError) => void = () => {};

  constructor(readonly store = new TrainingStore(), private api: TrainingApi = TRAINING_API, private report = reportError,
    private now: () => number = Date.now, private locks: LockManager | null | undefined = globalThis.navigator?.locks) {}

  setUnauthorizedHandler(handler: (error: ApiError) => void) { this.unauthorized = handler; }

  async signedIn(userId: string): Promise<void> {
    const generation = ++this.generation;
    this.authenticated = false;
    const owner = await this.store.signIn(userId);
    if (generation !== this.generation) return;
    this.owner = owner;
    this.authenticated = true;
    this.requestSync();
  }

  /** 401 оставляет владельца и его очередь на диске до следующего входа. */
  pause(): void { this.generation++; this.authenticated = false; }

  async signOut(): Promise<void> {
    this.pause();
    const owner = this.owner;
    if (owner) {
      try { await this.store.signOut(owner); }
      catch (error) { this.reportStorage(error); throw error; }
    }
    // Не потерять возможность повторить очистку, если IndexedDB сейчас недоступен.
    this.owner = undefined;
  }

  private current() { return this.authenticated ? this.owner : undefined; }
  private isCurrent(owner: TrainingOwner, generation: number) { return this.current() === owner && this.generation === generation; }

  async options(signal?: AbortSignal) {
    const generation = this.generation;
    try { return await this.api.options({ types: SUPPORTED_TYPES }, { signal }); }
    catch (error) { if (generation === this.generation) this.handle(error); throw error; }
  }

  async start(request: TrainingRequest): Promise<string> {
    const owner = this.current();
    const generation = this.generation;
    if (!owner) throw new Error('training start without session');
    try {
      const session = await this.api.start(request);
      if (!this.isCurrent(owner, generation)) throw new Error('training session changed during start');
      if (!await this.store.put(owner, storedTraining(session, this.now()))) throw new Error('training owner changed during start');
      await this.store.prune(owner);
      return session.id;
    } catch (error) { if (generation === this.generation) this.handle(error); throw error; }
  }

  async list(): Promise<StoredTraining[]> { return this.owner ? this.store.list(this.owner) : []; }
  async get(id: string): Promise<StoredTraining | undefined> { return this.owner ? this.store.get(this.owner, id) : undefined; }
  async active(): Promise<StoredTraining | undefined> {
    return (await this.list()).filter((t) => !t.finish && TrainingRules.remainingSeconds(t, this.now()) !== 0)
      .sort((a, b) => b.startedAtMillis - a.startedAtMillis)[0];
  }

  async answer(id: string, answer: GivenAnswer): Promise<void> {
    const checked = schemas.GivenAnswer.parse(answer);
    await this.edit(id, (t) => t.finish || checked.position >= t.session.items.length ? t : {
      ...t, answers: { ...t.answers, [checked.position]: checked }, unsent: [...new Set([...t.unsent, checked.position])],
    });
    this.requestSync();
  }

  async moveTo(id: string, position: number): Promise<void> {
    await this.edit(id, (t) => position >= 0 && position < t.session.items.length ? { ...t, position } : t);
  }

  async finish(id: string, timedOut: boolean): Promise<void> {
    await this.edit(id, (t) => t.finish ? t : { ...t, finish: { finishedAt: new Date(this.now()).toISOString(), timedOut } });
    this.requestSync();
  }

  private async edit(id: string, change: (t: StoredTraining) => StoredTraining) {
    const owner = this.owner;
    if (!owner) return;
    try { await this.store.update(owner, id, change); }
    catch (error) { this.handle(error); throw error; }
  }

  requestSync = (): void => { void this.sync().catch((error: unknown) => this.reportStorage(error)); };

  sync(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    this.again = false;
    this.running = this.runSync().finally(() => {
      this.running = undefined;
      // Между возвратом обработчика и освобождением Web Lock мог появиться ещё один ответ.
      if (this.again) this.requestSync();
    });
    return this.running;
  }

  private async runSync() {
    if (!this.current()) return;
    if (!this.locks) { this.report(new Error('training sync unavailable: Web Locks missing')); return; }
    await this.locks.request(SYNC_LOCK, async () => {
      do { this.again = false; await this.syncOnce(); } while (this.again);
    });
  }

  private async syncOnce() {
    const owner = this.current();
    const generation = this.generation;
    if (!owner) return;
    const all = (await this.store.list(owner)).sort((a, b) => a.startedAtMillis - b.startedAtMillis);
    for (let training of all) {
      if (!this.isCurrent(owner, generation)) return;
      if (!training.finish && TrainingRules.remainingSeconds(training, this.now()) === 0) {
        const end = training.startedAtMillis + (training.session.timeLimitSeconds ?? 0) * 1000;
        await this.store.update(owner, training.session.id, (t) => t.finish ? t : { ...t, finish: { finishedAt: new Date(end).toISOString(), timedOut: true } });
        const fresh = await this.store.get(owner, training.session.id);
        if (!fresh) continue;
        training = fresh;
      }
      const id = training.session.id;
      if (training.unsent.length > 0) {
        const sent = Object.values(training.answers).filter((answer) => training.unsent.includes(answer.position)).sort((a, b) => a.position - b.position);
        const outcome = await this.send(owner, generation, () => this.api.answers(id, { answers: sent }), async () => {
          // Новый выбор во время запроса не подтверждён этим запросом и остаётся в очереди.
          await this.store.update(owner, id, (t) => ({ ...t, unsent: t.unsent.filter((position) =>
            !sent.some((answer) => JSON.stringify(answer) === JSON.stringify(t.answers[String(position)]))) }));
        });
        if (outcome === 'stop') return;
        if (outcome === 'later') continue;
      }
      const fresh = await this.store.get(owner, id);
      if (fresh?.finish && !fresh.finishSent && fresh.unsent.length === 0) {
        const finish = fresh.finish;
        const outcome = await this.send(owner, generation, () => this.api.finish(id, finish), async () => {
          await this.store.update(owner, id, (t) => ({ ...t, finishSent: true }));
        });
        if (outcome === 'stop') return;
      }
    }
    await this.store.prune(owner);
  }

  private async send(owner: TrainingOwner, generation: number, action: () => Promise<unknown>, done: () => Promise<void>): Promise<'done' | 'later' | 'stop'> {
    if (!this.isCurrent(owner, generation) || !await this.store.owns(owner)) return 'stop';
    let failure: unknown;
    try { await action(); } catch (error) { failure = error; }
    if (!this.isCurrent(owner, generation) || !await this.store.owns(owner)) return 'stop';
    if (failure === undefined) { await done(); return 'done'; }
    this.handle(failure);
    if (failure instanceof ApiError) {
      if (failure.kind === 'network' || failure.status === 401) return 'stop';
      if (PERMANENT.has(failure.status)) {
        this.report(new Error(`training sync rejected: ${failure.status} ${failure.code}`));
        await done();
        return 'done';
      }
    }
    return 'later';
  }

  private reportStorage(error: unknown) {
    // Ни содержимое задания, ни ответы человека, ни сообщение внешней ошибки в отчёт не попадают.
    this.report(new Error(`training storage failed: ${error instanceof Error ? error.name : 'unknown'}`));
  }
  private handle(error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    if (error instanceof ApiError) {
      if (error.status === 401) { this.pause(); this.unauthorized(error); }
      else if (error.kind === 'contract' || error.status >= 500) this.report(new Error(`training API failed: ${error.status} ${error.code}`));
    } else this.reportStorage(error);
  }
}

export const trainingRepository = new TrainingRepository();
