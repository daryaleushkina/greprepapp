import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { BackIcon, CheckIcon, ChevronRightIcon } from '../components/icons';
import { StatusScreen } from '../components/StatusScreen';
import { useI18n } from '../i18n/i18n';
import glass from '../styles/glass.module.css';
import { TYPE_LABELS } from './builder';
import type { StoredTraining } from './model';
import { Explanation, Options, QuestionPrompt, SessionIcon } from './QuestionContent';
import { ReadTraining, TrainingHeading } from './ReadTraining';
import { TrainingRules } from './rules';
import styles from './Training.module.css';

export function ReviewScreen() {
  const { trainingId } = useParams({ from: '/app/training/$trainingId/review' });
  const navigate = useNavigate();
  const { t } = useI18n();
  return <ReadTraining id={trainingId} finishedOnly back={<Link to="/training/$trainingId" params={{ trainingId }} className={styles.back}><BackIcon />{t.back}</Link>}
    onBack={() => void navigate({ to: '/training/$trainingId', params: { trainingId } })}>
    {(training) => <ReviewList training={training} />}
  </ReadTraining>;
}

function ReviewList({ training }: { training: StoredTraining }) {
  const { t, locale } = useI18n();
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const text = t.training;
  const result = TrainingRules.result(training);
  const outcome = (position: number) => {
    const item = training.session.items[position]!;
    const chosen = training.answers[String(position)]?.optionIds ?? [];
    return chosen.length === 0 ? 'unanswered' : TrainingRules.isCorrect(item.question, chosen) ? 'correct' : 'wrong';
  };
  const mistakes = training.session.items.filter((item) => outcome(item.position) !== 'correct');
  const shown = onlyMistakes ? mistakes : training.session.items;
  return <>
    <TrainingHeading>{training.session.mode === 'check' ? text.review_title_check : text.review_title_practice}</TrainingHeading>
    <p className={styles.note}>{text.summary_correct_of(result.correct, result.total)} · <span lang="en">{training.session.section === 'quant' ? 'Quant' : 'Verbal'}</span> · {t.today.minutes(TrainingRules.summaryMinutes(result.durationSeconds).minutes)}</p>
    <div className={`${styles.segments} ${glass.glass} ${styles.reviewFilters}`} role="group" aria-label={text.review_filter}>
      <button aria-pressed={!onlyMistakes} onClick={() => setOnlyMistakes(false)}>{text.review_all(result.total)}</button>
      <button aria-pressed={onlyMistakes} onClick={() => setOnlyMistakes(true)}>{text.review_mistakes(mistakes.length)}</button>
    </div>
    {shown.length === 0 ? <p>{text.review_no_mistakes}</p> : <ul className={styles.reviewList}>{shown.map(({ position, question }) => {
      const state = outcome(position);
      const description = state === 'correct' ? text.review_correct : state === 'wrong' ? text.review_wrong : text.review_unanswered;
      return <li key={position}><Link to="/training/$trainingId/review/$position" params={{ trainingId: training.session.id, position: String(position) }} className={styles.reviewRow} aria-label={`${text.review_question(position + 1)}, ${description}, ${TYPE_LABELS[question.questionType]}, ${question.topicTitle[locale]}`}>
        <span className={styles.reviewNumber}>{position + 1}</span>
        <span className={styles.reviewOutcome} data-outcome={state} aria-hidden="true">{state === 'correct' ? <CheckIcon /> : <SessionIcon>{state === 'wrong' ? <path d="m8 8 8 8m0-8-8 8" /> : <path d="M7 12h10" />}</SessionIcon>}</span>
        <span className={styles.grow}><span lang="en">{TYPE_LABELS[question.questionType]}</span><span className={styles.note}>{question.topicTitle[locale]}</span></span>
        <ChevronRightIcon />
      </Link></li>;
    })}</ul>}
  </>;
}

export function ReviewItemScreen() {
  const { trainingId, position } = useParams({ from: '/app/training/$trainingId/review/$position' });
  const navigate = useNavigate();
  const { t } = useI18n();
  return <ReadTraining id={trainingId} finishedOnly wide back={<Link to="/training/$trainingId/review" params={{ trainingId }} className={styles.back}><BackIcon />{t.back}</Link>}
    onBack={() => void navigate({ to: '/training/$trainingId/review', params: { trainingId } })}>
    {(training) => <ReviewItem key={`${trainingId}/${position}`} training={training} position={position} />}
  </ReadTraining>;
}

function ReviewItem({ training, position }: { training: StoredTraining; position: string }) {
  const { t, locale } = useI18n();
  const [language, setLanguage] = useState(locale);
  const index = Number(position);
  const item = Number.isSafeInteger(index) && index >= 0 ? training.session.items[index] : undefined;
  if (!item) return <StatusScreen title={t.training.training_missing_title} text={t.training.training_missing_message} />;
  const chosen = training.answers[String(index)]?.optionIds ?? [];
  return <>
    <TrainingHeading>{t.training.review_question(index + 1)}</TrainingHeading>
    <div className={styles.reviewItemHeader}>
      <p lang="en" className={styles.questionType}>{TYPE_LABELS[item.question.questionType]}</p>
      <Link to="/training/$trainingId/report/$position" params={{ trainingId: training.session.id, position }} search={{ returnTo: 'review' }} className={styles.reportLink}>{t.training.question_report}</Link>
    </div>
    {!chosen.length && <p className={styles.note}>{t.training.review_unanswered}</p>}
    <div className={`${styles.questionLayout} ${styles.reviewQuestionLayout}`}>
      <section className={styles.question} aria-label={t.training.review_question(index + 1)}>
        <QuestionPrompt question={item.question} selection={item.question.answer} />
        <Options question={item.question} selection={chosen} revealed onSelect={() => {}} />
      </section>
      <Explanation question={item.question} chosen={chosen} language={language} onLanguage={setLanguage} />
    </div>
  </>;
}
