import type { Question } from '@greprep/api-client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { CheckIcon } from '../components/icons';
import { dictionaries } from '../i18n/dict';
import { useI18n } from '../i18n/i18n';
import type { Locale } from '../i18n/locale';
import glass from '../styles/glass.module.css';
import { TrainingRules } from './rules';
import styles from './Training.module.css';

export const BLANKS = ['(i)', '(ii)', '(iii)'];

export function QuestionPrompt({ question: q, selection }: { question: Question; selection: string[] }) {
  const { t } = useI18n();
  if (q.questionType === 'quantitative_comparison') return <div className={styles.quantities}>
    {q.condition && <p lang="en" className={styles.prompt}>{q.condition}</p>}
    <div className={styles.quantityRow}>{[['Quantity A', q.quantityA], ['Quantity B', q.quantityB]].map(([label, value]) => <div key={label} className={styles.quantity}><span lang="en" className={styles.note}>{label}</span><strong lang="en">{value}</strong></div>)}</div>
  </div>;
  return <p lang="en" className={styles.prompt}>{q.prompt.split('___').map((part, index) => <span key={index}>{index > 0 && <span className={styles.blank} role="img" aria-label={`${t.training.question_blank} ${BLANKS[index - 1] ?? ''}${q.groups[index - 1]?.options.some((option) => selection.includes(option.id)) ? ': ' + q.groups[index - 1]?.options.filter((option) => selection.includes(option.id)).map((option) => option.text).join(', ') : ''}`}>
    {q.groups[index - 1]?.options.filter((option) => selection.includes(option.id)).map((option) => option.text).join(' / ') || '　　'}{q.groups.length > 1 && <small>{BLANKS[index - 1]}</small>}
  </span>}{part}</span>)}</p>;
}

export function Options({ question: q, selection, revealed, onSelect }: { question: Question; selection: string[]; revealed: boolean; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const many = q.groups.length > 1;
  return <div className={styles.options}>{q.groups.map((group, index) => <div key={index} className={styles.optionGroup} role={revealed ? undefined : q.selectCount === 1 ? 'radiogroup' : 'group'} aria-label={many ? `${t.training.question_blank} ${BLANKS[index]}` : t.training.builder_type}>
    {many && !revealed && <p className={styles.note}>{BLANKS[index]}</p>}
    <div className={many && !revealed ? styles.chips : styles.options}>
      {group.options.filter((option) => !revealed || selection.includes(option.id) || q.answer.includes(option.id)).map((option, optionIndex) => {
        const correct = revealed && q.answer.includes(option.id);
        const wrong = revealed && !correct;
        const content = <><span className={styles.letter} lang="en">{many && revealed ? BLANKS[index] : many ? null : option.id}</span><span lang="en" className={styles.optionText}>{option.text}</span>{revealed && <span className={styles.optionMark}>{correct ? t.training.question_correct_mark : t.training.question_yours_mark}{correct ? <CheckIcon /> : <Cross />}</span>}{!revealed && !many && <kbd className={styles.optionKey}>{String.fromCharCode(65 + optionIndex)}</kbd>}</>;
        return revealed ? <div key={option.id} className={styles.option} data-result={correct ? 'correct' : wrong ? 'wrong' : undefined}>{content}</div> :
          <button key={option.id} className={styles.option} type="button" role={q.selectCount === 1 ? 'radio' : 'checkbox'} aria-checked={selection.includes(option.id)} onClick={() => onSelect(option.id)}>{content}</button>;
      })}
    </div>
    {revealed && <p className={styles.others} aria-label={t.training.question_others} lang="en">{group.options.filter((option) => !selection.includes(option.id) && !q.answer.includes(option.id)).map((option) => `${many ? '' : option.id + ' '}${option.text}`).join('　 ')}</p>}
  </div>)}</div>;
}

function RichText({ text }: { text: string }) {
  return <>{text.split(/(\*[^*]+\*)/).map((part, index) => part.startsWith('*') && part.endsWith('*') ? <em key={index}>{part.slice(1, -1)}</em> : <span key={index}>{part}</span>)}</>;
}

export function Explanation({ question: q, chosen, language, onLanguage }: { question: Question; chosen: string[]; language: Locale; onLanguage: (language: Locale) => void }) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const whyNotId = useId();
  useEffect(() => { setOpen(false); }, [q.id]);
  const text = dictionaries[language].training;
  const correct = TrainingRules.isCorrect(q, chosen);
  const wrong = q.explanation.options.filter((item) => chosen.includes(item.optionId) && !q.answer.includes(item.optionId));
  const options = q.groups.flatMap((group) => group.options);
  const keys = options.filter((option) => q.answer.includes(option.id)).map((option) => `${q.groups.length === 1 ? option.id + ', ' : ''}${option.text}`).join(` ${text.summary_and} `);
  const wrongLabel = options.filter((option) => wrong.some((item) => item.optionId === option.id)).map((option) => option.text).join(', ');
  return <section lang={language} className={styles.explanation} data-testid="explanation">
    <span className={styles.verdictDot} data-correct={correct} aria-hidden="true">{correct ? <CheckIcon /> : <Cross />}</span>
    <div className={styles.explanationBody}>
      <p role="status"><strong>{chosen.length ? correct ? text.verdict_correct : text.verdict_wrong : ''}</strong>{!correct && ` ${q.answer.length > 1 ? text.verdict_answers(keys) : text.verdict_answer(keys)}`}</p>
      <p className={styles.solution}><RichText text={q.explanation.solution[language]} /></p>
      <div className={styles.explanationTools}>
        {wrong.length > 0 && <button className={`${styles.whyNot} ${glass.glass}`} aria-expanded={open} aria-controls={whyNotId} onClick={() => setOpen(!open)}>{text.why_not(wrongLabel)}</button>}
        <div className={`${styles.segments} ${glass.glass}`} aria-label={dictionaries[locale].training.explanation_language}>{(['ru', 'en'] as const).map((lang) => <button key={lang} type="button" aria-pressed={language === lang} onClick={() => onLanguage(lang)}>{lang.toUpperCase()}</button>)}</div>
      </div>
      {open && <div id={whyNotId} className={styles.whyNotBody}>{wrong.map((item) => <p key={item.optionId} data-testid="explanation-option"><RichText text={item.text[language]} /></p>)}</div>}
    </div>
  </section>;
}

export function SessionIcon({ children }: { children: ReactNode }) { return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>; }
export function Cross() { return <SessionIcon><path d="m8 8 8 8m0-8-8 8" /></SessionIcon>; }
