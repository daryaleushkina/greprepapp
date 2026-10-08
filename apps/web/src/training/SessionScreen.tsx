import type { TrainingRequest } from '@greprep/api-client';
import { isApiError } from '@greprep/api-client';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackIcon } from '../components/icons';
import { StatusScreen } from '../components/StatusScreen';
import { useI18n } from '../i18n/i18n';
import { FocusLayout } from '../layout/AppLayout';
import { useShell } from '../shellContext';
import glass from '../styles/glass.module.css';
import { TrainingStorageBlocked } from './ReadTraining';
import { useBackButton } from '../telegram/hooks';
import { useOnline } from '../useOnline';
import { TrainingActions } from './Action';
import { TYPE_LABELS } from './builder';
import { useStoredTraining, useTrainingStorage } from './hooks';
import type { StoredTraining } from './model';
import { trainingRepository } from './repository';
import { TrainingRules } from './rules';
import styles from './Training.module.css';
import { useTrainingSession } from './useTrainingSession';
import { BLANKS, QuestionPrompt, Options, Explanation, SessionIcon } from './QuestionContent';

export function SessionScreen() {
  const { trainingId } = useParams({ from: '/app/training/$trainingId' });
  const { t } = useI18n();
  const { shell } = useShell();
  const navigate = useNavigate();
  const training = useStoredTraining(trainingId);
  const storage = useTrainingStorage();
  useBackButton(shell === 'telegram' ? () => void navigate({ to: '/' }) : null);
  return <FocusLayout glow={training.data?.session.section ?? 'verbal'} training wide session>
    {storage === 'blocked' || storage === 'unavailable' || training.isPending || !training.data ? <div className={styles.screen}>
      {shell === 'site' && <Link to="/" className={styles.back}>{t.training.question_close}</Link>}
      {storage === 'blocked' ? <TrainingStorageBlocked /> : storage === 'unavailable' ? <StatusScreen title={t.training.training_storage_title} text={t.training.training_storage_message} /> : training.isPending ? <p role="status">{t.today.loading}</p> :
        <StatusScreen title={t.training.training_missing_title} text={t.training.training_missing_message} />}
    </div> : <ActiveSession key={trainingId} incoming={training.data} />}
  </FocusLayout>;
}

function ActiveSession({ incoming }: { incoming: StoredTraining }) {
  const s = useTrainingSession(incoming);
  const { t, locale } = useI18n();
  const [language, setLanguage] = useState(locale);
  const { shell } = useShell();
  const text = t.training;
  const total = s.training.session.items.length;
  const last = s.position === total - 1;
  const primary = s.overview ? text.overview_finish : s.checkMode ? last ? text.question_to_list : text.question_next(s.position + 2, total) : s.revealed ? last ? text.question_result : text.question_next(s.position + 2, total) : text.question_check;
  const act = s.primary;
  const secondary = s.overview ? { text: text.overview_back(s.position + 1), onClick: () => s.setOverview(false) } : s.checkMode ? { text: text.question_skip, onClick: s.next } : !s.revealed ? { text: text.question_dont_know, onClick: s.dontKnow } : undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [s.position, s.overview, s.training.finish]);
  const keyboard = useRef(s);
  useLayoutEffect(() => { keyboard.current = s; });
  useEffect(() => {
    if (shell !== 'site') return;
    const key = (event: KeyboardEvent) => {
      const s = keyboard.current;
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || s.training.finish || s.overview) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], a')) return;
      // Enter всегда соответствует подсказке; пробел сохраняет нативный выбор сфокусированного варианта.
      if (/^[a-f]$/i.test(event.key) && !s.revealed) {
        event.preventDefault(); s.selectKey(event.key);
      } else if (event.key === 'Enter') { event.preventDefault(); s.primary(); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); s.next(); }
      else if (event.key === 'ArrowLeft' && s.checkMode) { event.preventDefault(); s.previous(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [shell]);
  if (s.training.finish) return <Summary training={s.training} />;
  const missing = TrainingRules.missingGroups(s.question, s.selection);
  const note = s.overview ? undefined : s.checkMode ? text.question_check_note : s.selection.length && missing.length ? s.question.groups.length > 1 ? (missing.length === 1 ? text.question_missing_blank : text.question_missing_blanks)(missing.map((i) => BLANKS[i]).join(', ')) : s.question.selectCount > 1 ? text.question_pick_one_more : undefined : undefined;
  const typeNote = s.question.groups.length === 3 ? text.type_three_blanks : s.question.groups.length === 2 ? text.type_two_blanks : s.question.selectCount === 2 ? text.type_two_answers : undefined;
  // Неполный ответ ещё требует возврата к вопросу (решение Даши 09.10.2026).
  const overviewItems = s.training.session.items.map(({ position, question }) => ({ position,
    answered: TrainingRules.isComplete(question, s.training.answers[String(position)]?.optionIds ?? []),
  }));
  const answered = overviewItems.filter((item) => item.answered).length;
  const flags = Object.values(s.training.answers).filter((answer) => answer.flagged).length;
  return <div className={`${styles.session} ${styles.screen}`} data-shell={shell} data-section={s.training.session.section}>
    <header className={styles.sessionHeader}>
      {shell === 'site' && <Link to="/" className={styles.close} aria-label={text.question_close}><BackIcon /></Link>}
      <div className={styles.progress} aria-label={text.question_progress_description(s.position + 1, total)}>
        {s.remaining !== undefined ? <span role="timer" className={`${glass.glass} ${styles.timer}`} aria-label={text.timer_description(Math.floor(s.remaining / 60), s.remaining % 60, s.position + 1, total)}>{Math.floor(s.remaining / 60)}:{String(s.remaining % 60).padStart(2, '0')}</span> : total <= 12 && <span className={styles.dots} aria-hidden="true">{s.training.session.items.map((item) => <i key={item.position} data-current={item.position === s.position || undefined} data-result={!s.checkMode && s.training.answers[String(item.position)] ? TrainingRules.isCorrect(item.question, s.training.answers[String(item.position)]!.optionIds) ? 'correct' : 'wrong' : undefined} />)}</span>}
        <span>{text.question_of(s.position + 1, total)}</span>
      </div>
      {s.overview ? <span className={styles.headerSpace} /> : <div className={styles.headerActions}>
        <Link to="/training/$trainingId/report/$position" params={{ trainingId: s.training.session.id, position: s.position }} search={{ returnTo: 'session' }} className={styles.reportLink}>{text.question_report}</Link>
        {s.checkMode && <div className={styles.headerActions}>
          <button className={styles.iconButton} disabled={s.busy} aria-label={s.flagged ? text.question_unflag : text.question_flag} aria-pressed={s.flagged} onClick={s.flag}><Flag filled={s.flagged} /></button>
          <button className={styles.iconButton} disabled={s.busy} aria-label={text.question_overview} onClick={() => s.setOverview(true)}><Grid /></button>
        </div>}
      </div>}
    </header>
    {s.overview ? <section className={styles.overview}>
      <h1 ref={heading} tabIndex={-1} className={styles.title}>{text.question_overview}</h1>
      <p className={styles.note}>{text.overview_summary(answered, total, flags)}</p>
      <div className={styles.questionGrid}>{overviewItems.map(({ position, answered }) => {
        const answer = s.training.answers[String(position)];
        const state = [answered ? text.overview_answered : text.overview_empty, answer?.flagged ? text.overview_flagged : undefined].filter(Boolean).join(', ');
        return <button key={position} className={styles.overviewCell} disabled={s.busy} data-answered={answered} aria-current={position === s.position ? 'step' : undefined} aria-label={text.overview_item(position + 1, state)} onClick={() => s.go(position)}>{position + 1}{answer?.flagged && <Flag filled />}</button>;
      })}</div>
    </section> : <div className={styles.questionLayout}>
      <section className={styles.question}>
        <h1 ref={heading} tabIndex={-1} className={styles.questionType}>{TYPE_LABELS[s.question.questionType]}{typeNote && ` · ${typeNote}`}</h1>
        <QuestionPrompt question={s.question} selection={s.revealed ? s.question.answer : s.selection} />
        <Options question={s.question} selection={s.selection} revealed={s.revealed} onSelect={s.select} />
      </section>
      {s.revealed && <Explanation question={s.question} chosen={s.answer?.optionIds ?? []} language={language} onLanguage={setLanguage} />}
    </div>}
    <footer className={styles.sessionFooter}>
      {s.failed && <p role="alert" className={styles.note}>{text.training_storage_message}</p>}
      {note && <p role="status" className={styles.note}>{note}</p>}
      {shell === 'site' && !s.overview && <p className={styles.keys}><kbd>A–{String.fromCharCode(64 + Math.max(...s.question.groups.map((group) => group.options.length)))}</kbd> {t.training.question_select_hint} <kbd>Enter</kbd> {primary} {(s.checkMode || s.revealed) && <kbd>→</kbd>}</p>}
      <TrainingActions secondary={secondary && { ...secondary, disabled: s.busy }} primary={{ text: primary, disabled: s.busy || (!s.checkMode && !s.revealed && !s.complete), busy: s.busy, onClick: act }} />
      {s.checkMode && !s.overview && s.position > 0 && <button className={styles.textButton} disabled={s.busy} onClick={() => s.go(s.position - 1)}>{t.back}</button>}
    </footer>
  </div>;
}

function Summary({ training }: { training: StoredTraining }) {
  const { t, locale } = useI18n();
  const { shell } = useShell();
  const navigate = useNavigate();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const starting = useRef(false);
  const result = TrainingRules.result(training);
  const text = t.training;
  const count = TrainingRules.repeatCount(result.review.reduce((sum, topic) => sum + topic.mistakes, 0));
  const time = TrainingRules.summaryMinutes(result.durationSeconds, training.session.mode === 'check' ? training.session.timeLimitSeconds : undefined);
  const duration = t.today.minutes(time.minutes).replaceAll(' ', '\u00a0');
  const line = time.limitMinutes === undefined ? [training.session.section === 'quant' ? 'Quant' : 'Verbal', ...training.session.questionTypes.map((type) => TYPE_LABELS[type]), duration].join(' · ') : [text.mode_check, training.session.section === 'quant' ? 'Quant' : 'Verbal', text.summary_of_limit(duration, time.limitMinutes)].join(' · ');
  const close = () => void navigate({ to: '/' });
  const repeat = async () => {
    if (starting.current || !online) return;
    starting.current = true; setBusy(true); setProblem(undefined);
    const request: TrainingRequest = { section: training.session.section, questionTypes: training.session.questionTypes, count, mode: 'practice', topicIds: result.review.map((topic) => topic.topicId) };
    try {
      const trainingId = await trainingRepository.start(request);
      await navigate({ to: '/training/$trainingId', params: { trainingId } });
    } catch (error) { setProblem(isApiError(error) && error.kind === 'network' ? text.builder_start_offline : isApiError(error) && error.code === 'no_questions' ? text.builder_no_questions : text.builder_start_failed); }
    finally { starting.current = false; setBusy(false); }
  };
  return <div className={`${styles.screen} ${styles.session} ${styles.summary}`} data-shell={shell} data-section={training.session.section}>
    {shell === 'site' && <Link to="/" className={styles.close} aria-label={text.summary_done}><BackIcon /></Link>}
    <h1 className={styles.score} aria-label={text.summary_correct_of(result.correct, result.total)}><span>{result.correct}</span><small>{text.summary_correct_of(result.correct, result.total).replace(String(result.correct), '').trim()}</small></h1>
    <p className={styles.note}>{line}</p>
    {training.finish?.timedOut && <p className={styles.note}>{text.summary_timed_out}</p>}
    {training.finish?.timedOut && result.unanswered > 0 && <p>{text.summary_ran_out(text.questionsCount(result.unanswered))}</p>}
    {result.review.length ? <section className={styles.reviewTopics}>
      <h2>{text.summary_review}</h2>
      {result.review.map((topic) => {
        const numbers = topic.positions.map((position) => String(position + 1));
        const list = numbers.length === 1 ? numbers[0]! : `${numbers.slice(0, -1).join(', ')} ${text.summary_and} ${numbers.at(-1)}`;
        return <div key={topic.topicId} className={styles.reviewTopic}><i aria-hidden="true" /><div><h3>{topic.title[locale]}</h3><p className={styles.note}>{text.summary_mistakes(topic.mistakes)} · {(numbers.length === 1 ? text.summary_question : text.summary_questions)(list)}</p></div></div>;
      })}
    </section> : !result.unanswered && <p>{text.summary_perfect}</p>}
    <Link to="/training/$trainingId/review" params={{ trainingId: training.session.id }} className={styles.allAnswers}>{text.summary_all_answers}</Link>
    <footer className={styles.sessionFooter}>
      {(problem || !online && result.review.length > 0) && <p role="status" className={styles.note}>{problem ?? text.builder_start_offline}</p>}
      <TrainingActions secondary={result.review.length > 0 ? { text: text.summary_done, disabled: busy, onClick: close } : undefined} primary={{ text: result.review.length ? text.summary_repeat(text.questionsCount(count)) : text.summary_done, disabled: busy || Boolean(result.review.length && !online), busy, onClick: result.review.length ? () => void repeat() : close }} />
    </footer>
  </div>;
}

function Flag({ filled = false }: { filled?: boolean }) { return <SessionIcon><path d="M5 21V3m0 1c5-3 9 3 14 0v10c-5 3-9-3-14 0" fill={filled ? 'currentColor' : 'none'} /></SessionIcon>; }
function Grid() { return <SessionIcon>{[4, 14].flatMap((x) => [4, 14].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" rx="1" />))}</SessionIcon>; }
