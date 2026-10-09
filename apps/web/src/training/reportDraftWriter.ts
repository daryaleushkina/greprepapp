import type { ReportDraft } from './model';

// Пауза объединяет быстрый ввод в одну транзакцию IndexedDB.
const WRITE_DELAY_MS = 250;

/** Храним только последнюю версию: быстрый ввод не строит очередь транзакций на каждую букву. */
export class ReportDraftWriter {
  private latest: ReportDraft | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | undefined;
  private stopped = false;
  private paused = false;

  constructor(private save: (draft: ReportDraft) => Promise<void>, private changed: (saving: boolean) => void,
    private failed: (error: unknown) => void) {}

  change(draft: ReportDraft): void {
    if (this.stopped) return;
    this.latest = draft;
    this.changed(true);
    if (this.writing || this.paused) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.write(); }, WRITE_DELAY_MS);
  }

  private write(): Promise<void> {
    if (this.writing) return this.writing;
    if (!this.latest || this.stopped || this.paused) return Promise.resolve();
    const draft = this.latest;
    this.latest = undefined;
    this.writing = this.save(draft).catch((error: unknown) => {
      this.latest ??= draft;
      this.paused = true;
      this.failed(error);
    }).then(async () => {
      this.writing = undefined;
      // Следующая запись берёт последнее значение, а не каждую промежуточную букву.
      if (this.latest && !this.paused && !this.stopped) await this.write();
      else if (!this.latest) this.changed(false);
    });
    return this.writing;
  }

  flush(retry = false): Promise<void> {
    clearTimeout(this.timer); this.timer = undefined;
    if (retry) this.paused = false;
    return this.write();
  }

  discard(): Promise<void> {
    this.stopped = true; this.latest = undefined;
    clearTimeout(this.timer); this.timer = undefined;
    return this.writing ?? Promise.resolve();
  }
}
