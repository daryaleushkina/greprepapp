import type { QuestionReport } from '@greprep/api-client';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { BackIcon } from '../components/icons';
import { StatusScreen } from '../components/StatusScreen';
import { useDraftCloseProtection } from '../telegram/hooks';
import { useI18n } from '../i18n/i18n';
import { TrainingAction } from './Action';
import { TYPE_LABELS } from './builder';
import { REPORT_TEXT_MAX, type ReportDraft, type StoredTraining } from './model';
import { ReadTraining, TrainingHeading } from './ReadTraining';
import { trainingRepository } from './repository';
import { TrainingOwnerChangedError } from './store';
import styles from './Training.module.css';

const KINDS = ['question', 'answer', 'explanation', 'translation', 'other'] as const;
const COUNTER_WARNING = REPORT_TEXT_MAX * 0.9;
type Failure = 'quota' | 'owner' | 'storage';
const failureKind = (error: unknown): Failure => error instanceof TrainingOwnerChangedError ? 'owner' :
  error instanceof DOMException && error.name === 'QuotaExceededError' ? 'quota' : 'storage';

export function ReportScreen() {
  const { trainingId, position } = useParams({ from: '/app/training/$trainingId/report/$position' });
  const { returnTo } = useSearch({ from: '/app/training/$trainingId/report/$position' });
  const navigate = useNavigate();
  const { t } = useI18n();
  const back = () => void (returnTo === 'review' ? navigate({ to: '/training/$trainingId/review/$position', params: { trainingId, position } }) : navigate({ to: '/training/$trainingId', params: { trainingId } }));
  const cancelRef = useRef<() => void>(back);
  const cancel = () => cancelRef.current();
  const link = returnTo === 'review' ? <Link to="/training/$trainingId/review/$position" params={{ trainingId, position }} className={styles.back} onClick={(event) => { event.preventDefault(); cancel(); }}><BackIcon />{t.back}</Link> :
    <Link to="/training/$trainingId" params={{ trainingId }} className={styles.back} onClick={(event) => { event.preventDefault(); cancel(); }}><BackIcon />{t.back}</Link>;
  return <ReadTraining id={trainingId} back={link} onBack={cancel}>
    {(training) => <ReportForm key={`${trainingId}/${position}`} training={training} position={position} onBack={back} cancelRef={cancelRef} />}
  </ReadTraining>;
}

function ReportForm({ training, position: index, onBack, cancelRef }: {
  training: StoredTraining; position: number | null; onBack: () => void; cancelRef: RefObject<() => void>;
}) {
  const { t } = useI18n();
  const draft = training.reportDrafts?.[String(index)];
  const [kind, setKind] = useState<QuestionReport['kind'] | undefined>(draft?.kind);
  const [text, setText] = useState(draft?.text ?? '');
  const [saving, setSaving] = useState(0);
  const [unsaved, setUnsaved] = useState(false);
  const revision = useRef(0);
  useDraftCloseProtection(unsaved);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<Failure>();
  const [truncated, setTruncated] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | undefined>(undefined);
  const pending = useRef(Promise.resolve());
  const sending = useRef(false);
  const cancelling = useRef(false);
  const item = index === null ? undefined : training.session.items[index];
  const copy = t.training;
  const count = Array.from(text).length;
  const persist = (value: ReportDraft) => {
    if (index === null) return;
    // Транзакция начинается на самом вводе: очередь промисов потеряла бы последний текст при выгрузке.
    const current = ++revision.current;
    setSaving((count) => count + 1); setUnsaved(true);
    const writing = trainingRepository.reportDraft(training.session.id, index, value)
      .then(() => { if (revision.current === current) setUnsaved(false); })
      .catch((error: unknown) => { setFailed(failureKind(error)); })
      .finally(() => { setSaving((count) => count - 1); });
    pending.current = Promise.all([pending.current, writing]).then(() => {});
  };
  const changeText = (value: string) => {
    const characters = Array.from(value);
    const next = characters.slice(0, REPORT_TEXT_MAX).join('');
    setTruncated(characters.length > REPORT_TEXT_MAX);
    setText(next); persist({ kind, text: next });
  };
  const insert = (value: string, element: HTMLTextAreaElement) => {
    const prefix = text.slice(0, element.selectionStart), suffix = text.slice(element.selectionEnd);
    const available = REPORT_TEXT_MAX - Array.from(prefix + suffix).length;
    const accepted = Array.from(value).slice(0, Math.max(0, available)).join('');
    caret.current = prefix.length + accepted.length;
    setTruncated(accepted !== value);
    const next = prefix + accepted + suffix;
    setText(next); persist({ kind, text: next });
    // Даже полностью отклонённая вставка сохраняет курсор, не ожидая нового значения поля.
    element.setSelectionRange(caret.current, caret.current);
  };
  useLayoutEffect(() => {
    if (caret.current !== undefined) { input.current?.setSelectionRange(caret.current, caret.current); caret.current = undefined; }
  });
  useLayoutEffect(() => {
    cancelRef.current = () => {
      if (cancelling.current) return;
      cancelling.current = true;
      void (async () => {
        try {
          await pending.current;
          if (index !== null && !sending.current && !sent) await trainingRepository.reportDraft(training.session.id, index);
          onBack();
        } catch (error) { setFailed(failureKind(error)); }
        finally { cancelling.current = false; }
      })();
    };
    return () => { cancelRef.current = onBack; };
  }, [cancelRef, index, onBack, sent, training.session.id]);
  const send = async () => {
    if (sending.current || !kind || !item || index === null) return;
    sending.current = true; setBusy(true); setFailed(undefined);
    try {
      await pending.current;
      const trimmed = text.trim();
      await trainingRepository.recordReport(item.question.id, { kind, ...(trimmed && { text: trimmed }), trainingId: training.session.id }, index);
      setSent(true); setText(''); setUnsaved(false);
    } catch (error) { setFailed(failureKind(error)); }
    finally { sending.current = false; setBusy(false); }
  };
  if (!item || index === null) return <StatusScreen title={copy.training_missing_title} text={copy.training_missing_message} />;
  if (sent) return <>
    <TrainingHeading>{copy.report_thanks}</TrainingHeading>
    <p role="status">{copy.report_saved}</p><p className={styles.note}>{copy.report_note}</p>
    <div className={styles.sessionFooter}><TrainingAction text={copy.report_back} disabled={false} onClick={onBack} /></div>
  </>;
  return <>
    <TrainingHeading>{copy.question_report}</TrainingHeading>
    <p className={styles.note}>{copy.report_context(index + 1, TYPE_LABELS[item.question.questionType])}</p>
    <form className={styles.reportForm} onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <fieldset className={styles.reportKinds} disabled={busy}><legend>{copy.report_kind}</legend>
        <div className={styles.chips}>{KINDS.map((value) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); persist({ kind: value, text }); }}>{copy[`report_kind_${value}`]}</button>)}</div>
      </fieldset>
      <label className={styles.reportField} htmlFor="report-text"><span className={styles.reportFieldHeading}><span id="report-label">{copy.report_text}</span>
        <span id="report-count" className={styles.note} aria-live={count >= COUNTER_WARNING ? 'polite' : 'off'}>{copy.report_limit(count, REPORT_TEXT_MAX)}</span>
      </span>
        <textarea ref={input} id="report-text" value={text} disabled={busy} rows={4}
          // Нативный лимит считает UTF-16; дополняем его уже введёнными суррогатными парами.
          maxLength={REPORT_TEXT_MAX + text.length - count} aria-labelledby="report-label" aria-busy={saving > 0} aria-describedby={`report-count report-draft-state${truncated ? ' report-truncated' : ''}`}
          onChange={(event) => changeText(event.target.value)}
          onPaste={(event) => { event.preventDefault(); insert(event.clipboardData.getData('text/plain'), event.currentTarget); }}
          onBeforeInput={(event) => {
            const native = event.nativeEvent;
            if (!('data' in native) || typeof native.data !== 'string' || !native.data || 'isComposing' in native && native.isComposing) return;
            const element = event.currentTarget;
            const next = text.slice(0, element.selectionStart) + native.data + text.slice(element.selectionEnd);
            if (next.length > element.maxLength) { event.preventDefault(); insert(native.data, element); }
          }} />
      </label>
      {(kind || text) && <p id="report-draft-state" role="status" className="visually-hidden">{unsaved ? copy.report_draft_saving : copy.report_draft_saved}</p>}
      {truncated && <p id="report-truncated" role="status" className={styles.note}>{copy.report_truncated}</p>}
      <p className={styles.note}>{copy.report_note}</p>
      {failed && <p role="alert">{failed === 'quota' ? copy.report_failed : failed === 'owner' ? copy.report_session_changed : copy.report_storage_failed}</p>}
      <div className={styles.sessionFooter}><TrainingAction text={copy.report_send} onClick={() => void send()} disabled={!kind || busy} busy={busy} /></div>
    </form>
  </>;
}
