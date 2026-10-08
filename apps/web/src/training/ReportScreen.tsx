import type { QuestionReport } from '@greprep/api-client';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { BackIcon } from '../components/icons';
import { StatusScreen } from '../components/StatusScreen';
import { useI18n } from '../i18n/i18n';
import { TrainingAction } from './Action';
import { TYPE_LABELS } from './builder';
import { REPORT_TEXT_MAX, type StoredTraining } from './model';
import { ReadTraining, TrainingHeading } from './ReadTraining';
import { trainingRepository } from './repository';
import styles from './Training.module.css';

const KINDS = ['question', 'answer', 'explanation', 'translation', 'other'] as const;

export function ReportScreen() {
  const { trainingId, position } = useParams({ from: '/app/training/$trainingId/report/$position' });
  const { returnTo } = useSearch({ from: '/app/training/$trainingId/report/$position' });
  const navigate = useNavigate();
  const { t } = useI18n();
  const back = () => void (returnTo === 'review' ? navigate({ to: '/training/$trainingId/review/$position', params: { trainingId, position } }) : navigate({ to: '/training/$trainingId', params: { trainingId } }));
  const link = returnTo === 'review' ? <Link to="/training/$trainingId/review/$position" params={{ trainingId, position }} className={styles.back}><BackIcon />{t.back}</Link> :
    <Link to="/training/$trainingId" params={{ trainingId }} className={styles.back}><BackIcon />{t.back}</Link>;
  return <ReadTraining id={trainingId} back={link} onBack={back}>
    {(training) => <ReportForm key={`${trainingId}/${position}`} training={training} position={position} onBack={back} />}
  </ReadTraining>;
}

function ReportForm({ training, position, onBack }: { training: StoredTraining; position: string; onBack: () => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<QuestionReport['kind']>();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const sending = useRef(false);
  const index = Number(position);
  const item = Number.isSafeInteger(index) && index >= 0 ? training.session.items[index] : undefined;
  const copy = t.training;
  const send = async () => {
    if (sending.current || !kind || !item) return;
    sending.current = true; setBusy(true); setFailed(false);
    try {
      const trimmed = text.trim();
      await trainingRepository.recordReport(item.question.id, { kind, ...(trimmed && { text: trimmed }), trainingId: training.session.id });
      setSent(true); setText('');
    } catch { setFailed(true); }
    finally { sending.current = false; setBusy(false); }
  };
  if (!item) return <StatusScreen title={copy.training_missing_title} text={copy.training_missing_message} />;
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
        <div className={styles.chips}>{KINDS.map((value) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{copy[`report_kind_${value}`]}</button>)}</div>
      </fieldset>
      <label className={styles.reportField} htmlFor="report-text">{copy.report_text}
        <textarea id="report-text" value={text} disabled={busy} rows={4} onChange={(event) => setText(Array.from(event.target.value).slice(0, REPORT_TEXT_MAX).join(''))} />
      </label>
      <p className={styles.note}>{copy.report_note}</p>
      {failed && <p role="alert">{copy.report_failed}</p>}
      <div className={styles.sessionFooter}><TrainingAction text={copy.report_send} onClick={() => void send()} disabled={!kind || busy} busy={busy} /></div>
    </form>
  </>;
}
