import type { QuestionReport } from '@greprep/api-client';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { BackIcon } from '../components/icons';
import { StatusScreen } from '../components/StatusScreen';
import { useI18n } from '../i18n/i18n';
import { TrainingAction } from './Action';
import { TYPE_LABELS } from './builder';
import { REPORT_TEXT_MAX, type ReportDraft, type StoredTraining } from './model';
import { ReadTraining, TrainingHeading } from './ReadTraining';
import { trainingRepository } from './repository';
import { TrainingMissingError, TrainingOwnerChangedError } from './store';
import styles from './Training.module.css';

const KINDS = ['question', 'answer', 'explanation', 'translation', 'other'] as const;
const COUNTER_WARNING = REPORT_TEXT_MAX * 0.9;
// textarea приводит переводы строк к LF; это не сокращение вставки по лимиту.
const nativeText = (value: string) => value.replace(/\r\n?/g, '\n');
const inputMaxLength = (prefix: string, suffix: string, inserted: string): number => {
  const surrounding = prefix + suffix;
  const count = Array.from(surrounding).length;
  let units = 0, accepted = 0;
  for (const character of inserted) {
    if (count + accepted >= REPORT_TEXT_MAX) break;
    units += character.length; accepted++;
  }
  // Оставляем место для дальнейшего набора: WebKit на нативном пределе уже не посылает beforeinput.
  return REPORT_TEXT_MAX + surrounding.length - count + units - accepted;
};
type Failure = 'quota' | 'owner' | 'missing' | 'storage';
const failureKind = (error: unknown): Failure => error instanceof TrainingOwnerChangedError ? 'owner' :
  error instanceof TrainingMissingError ? 'missing' : error instanceof DOMException && error.name === 'QuotaExceededError' ? 'quota' : 'storage';

export function ReportScreen() {
  const { trainingId, position } = useParams({ from: '/app/training/$trainingId/report/$position' });
  const { returnTo } = useSearch({ from: '/app/training/$trainingId/report/$position' });
  const navigate = useNavigate();
  const { t } = useI18n();
  const back = () => void (returnTo === 'review' ? navigate({ to: '/training/$trainingId/review/$position', params: { trainingId, position } }) : navigate({ to: '/training/$trainingId', params: { trainingId } }));
  const cancelRef = useRef<() => void>(back);
  const cancel = () => cancelRef.current();
  const link = returnTo === 'review' ? <Link to="/training/$trainingId/review/$position" params={{ trainingId, position }} className={styles.back} onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); cancel(); }}><BackIcon />{t.back}</Link> :
    <Link to="/training/$trainingId" params={{ trainingId }} className={styles.back} onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); cancel(); }}><BackIcon />{t.back}</Link>;
  return <ReadTraining id={trainingId} back={link} onBack={cancel}>
    {(training) => <ReportForm key={`${trainingId}/${position}`} training={training} position={position} onBack={back} cancelRef={cancelRef} />}
  </ReadTraining>;
}

function ReportForm({ training, position: index, onBack, cancelRef }: {
  training: StoredTraining; position: number | null; onBack: () => void; cancelRef: RefObject<() => void>;
}) {
  const [draft] = useState(() => index === null ? undefined : trainingRepository.getReportDraft(training.session.id, index));
  return <ReportFields training={training} index={index} onBack={onBack} cancelRef={cancelRef} draft={draft} />;
}

function ReportFields({ training, index, onBack, cancelRef, draft }: {
  training: StoredTraining; index: number | null; onBack: () => void; cancelRef: RefObject<() => void>; draft?: ReportDraft;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<QuestionReport['kind'] | undefined>(draft?.kind);
  const [text, setText] = useState(draft?.text ?? '');
  const [saved, setSaved] = useState(Boolean(draft));
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<Failure>();
  const [truncated, setTruncated] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const pasting = useRef(false);
  const sending = useRef(false);
  const cancelling = useRef(false);
  const item = index === null ? undefined : training.session.items[index];
  const copy = t.training;
  const count = Array.from(text).length;
  const [owner] = useState(trainingRepository.reportOwner);
  const persist = (value: ReportDraft) => {
    if (index !== null) setSaved(trainingRepository.reportDraft(training.session.id, index, value, owner));
  };
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const before = (event: InputEvent) => {
      // Только подстраиваем UTF-16 лимит под Unicode, не отменяя нативное редактирование и undo.
      if (event.inputType !== 'insertFromPaste') { pasting.current = false; setTruncated(false); }
      if (!event.data || event.isComposing) return;
      const prefix = element.value.slice(0, element.selectionStart), suffix = element.value.slice(element.selectionEnd);
      element.maxLength = inputMaxLength(prefix, suffix, nativeText(event.data));
    };
    element.addEventListener('beforeinput', before);
    return () => { element.removeEventListener('beforeinput', before); };
  }, [sent]);
  useLayoutEffect(() => {
    cancelRef.current = () => {
      if (cancelling.current) return;
      cancelling.current = true;
      if (index !== null) trainingRepository.discardReportDraft(training.session.id, index, owner);
      onBack();
    };
    return () => { cancelRef.current = onBack; };
  }, [cancelRef, index, onBack, owner, training.session.id]);
  const send = async () => {
    if (sending.current || !kind || !item || index === null) return;
    sending.current = true; setBusy(true); setFailed(undefined);
    try {
      const trimmed = text.trim();
      await trainingRepository.recordReport(item.question.id, { kind, ...(trimmed && { text: trimmed }), trainingId: training.session.id }, owner);
      // «Назад» уже очистил черновик. Поздний ответ очереди не стирает ввод повторно открытой формы.
      if (!cancelling.current) trainingRepository.discardReportDraft(training.session.id, index, owner);
      setSent(true); setText(''); setSaved(false);
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
          // Нативный лимит считает UTF-16; перед вставкой учитываем длину допустимых Unicode-символов.
          maxLength={REPORT_TEXT_MAX + text.length - count} aria-labelledby="report-label" aria-describedby={`report-count${kind || text ? ' report-draft-state' : ''}${truncated ? ' report-truncated' : ''}`}
          onChange={(event) => {
            const next = event.target.value;
            if (!pasting.current) setTruncated(false);
            pasting.current = false;
            setText(next); persist({ kind, text: next });
          }}
          onPaste={(event) => {
            const element = event.currentTarget;
            const value = nativeText(event.clipboardData.getData('text/plain'));
            const prefix = element.value.slice(0, element.selectionStart), suffix = element.value.slice(element.selectionEnd);
            pasting.current = true;
            const remaining = REPORT_TEXT_MAX - Array.from(prefix + suffix).length;
            setTruncated(Array.from(value).length > remaining);
            element.maxLength = inputMaxLength(prefix, suffix, value);
          }} />
      </label>
      {(kind || text) && !failed && <p id="report-draft-state" role="status" className="visually-hidden">{saved ? copy.report_draft_saved : copy.report_draft_unsaved}</p>}
      {truncated && <p id="report-truncated" role="status" className={styles.note}>{copy.report_truncated(REPORT_TEXT_MAX)}</p>}
      <p className={styles.note}>{copy.report_note}</p>
      {failed && <p role="alert">{failed === 'quota' ? copy.report_failed : failed === 'owner' ? copy.report_session_changed : failed === 'missing' ? copy.report_training_missing : copy.report_storage_failed}</p>}
      <div className={styles.sessionFooter}><TrainingAction text={copy.report_send} onClick={() => void send()} disabled={!kind || busy} busy={busy} /></div>
    </form>
  </>;
}
