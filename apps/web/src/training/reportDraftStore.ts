import { reportError } from '../errors/report';
import { reportDraftSchema, type ReportDraft } from './model';

/** Маленький черновик пишется синхронно: отмена не может догнать новую форму. */
export class ReportDraftStore {
  private reported = false;

  constructor(private namespace = 'greprep-trainings', private report: (error: unknown) => void = reportError,
    private storage: () => Storage = () => localStorage) {}

  private prefix(userId: string) { return `${this.namespace}/report-draft/${encodeURIComponent(userId)}/`; }
  private key(userId: string, id: string, position: number) { return `${this.prefix(userId)}${encodeURIComponent(id)}/${position}`; }

  private access<T>(action: (storage: Storage) => T): T | undefined {
    try { return action(this.storage()); }
    catch {
      // Ошибка браузера может содержать текст человека. Передаём только свою причину, один раз за сессию.
      if (!this.reported) { this.reported = true; this.report(new Error('training report draft storage unavailable')); }
      return undefined;
    }
  }

  get(userId: string, id: string, position: number): ReportDraft | undefined {
    return this.access((storage) => {
      const key = this.key(userId, id, position), raw = storage.getItem(key);
      if (raw === null) return undefined;
      let value: unknown;
      try { value = JSON.parse(raw); }
      catch { /* Испорченный JSON удаляется так же, как значение, не прошедшее схему. */ }
      const parsed = reportDraftSchema.safeParse(value);
      if (parsed.success && (parsed.data.kind || parsed.data.text)) return parsed.data;
      storage.removeItem(key);
      return undefined;
    });
  }

  put(userId: string, id: string, position: number, draft?: ReportDraft): boolean {
    const checked = draft === undefined ? undefined : reportDraftSchema.parse(draft);
    return this.access((storage) => {
      const key = this.key(userId, id, position);
      if (checked?.kind || checked?.text) storage.setItem(key, JSON.stringify(checked));
      else storage.removeItem(key);
      return true;
    }) ?? false;
  }

  private keys(storage: Storage, prefix: string) {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }

  clear(userId: string): void {
    this.access((storage) => { for (const key of this.keys(storage, this.prefix(userId))) storage.removeItem(key); });
  }

  prune(userId: string, trainingIds: string[]): void {
    const ids = new Set(trainingIds.map(encodeURIComponent)), prefix = this.prefix(userId);
    this.access((storage) => {
      for (const key of this.keys(storage, prefix)) {
        const id = key.slice(prefix.length).split('/')[0];
        if (!id || !ids.has(id)) storage.removeItem(key);
      }
    });
  }
}
