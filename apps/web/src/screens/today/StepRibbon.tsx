// Лента шагов — главный приём «Шагов» (DESIGN.md, «Лента шагов»): вертикальная нить с узлами, текущий шаг —
// стеклянная карточка с главной кнопкой, остальные — тихие строки, в конце — точка и «На сегодня всё.».
import type { TodayStep } from '@greprep/api-client';
import { Link } from '@tanstack/react-router';
import type { ComponentType, ReactNode } from 'react';
import { CheckIcon, EssayIcon, QuantIcon, VerbalIcon, WordsIcon } from '../../components/icons';
import { useI18n } from '../../i18n/i18n';
import glass from '../../styles/glass.module.css';
import { sectionLang } from './summary';
import styles from './Today.module.css';

const SECTION_ICON: Readonly<Record<TodayStep['section'], ComponentType>> = {
  verbal: VerbalIcon,
  quant: QuantIcon,
  words: WordsIcon,
  essay: EssayIcon,
};

interface Props {
  steps: readonly TodayStep[];
  /** Шаг, который не начался из-за сети: у него — объяснение. */
  blockedStepId: string | null;
  onStart: (step: TodayStep) => void;
}

export function StepRibbon({ steps, blockedStepId, onStart }: Props): ReactNode {
  const { t } = useI18n();
  const allDone = steps.every((s) => s.state === 'done');
  return (
    <ol aria-label={t.today.plan} className={styles.ribbon}>
      {steps.map((step) => (
        <li key={step.id} className={styles.item} data-state={step.state}>
          <span aria-hidden="true" className={styles.line} />
          <Node step={step} />
          {step.state === 'current' ? (
            <CurrentStep step={step} blocked={blockedStepId === step.id} onStart={onStart} />
          ) : (
            <StepRow step={step} blocked={blockedStepId === step.id} onStart={onStart} />
          )}
        </li>
      ))}
      <li className={styles.end} data-done={allDone || undefined}>
        <span aria-hidden="true" className={styles.endDot} />
        {allDone ? (
          <span className={styles.endText}>
            <span className={styles.endTitle}>{t.today.allDoneTitle}</span>
            <span className={styles.endNote}>{t.today.tomorrow}</span>
          </span>
        ) : (
          <span className={styles.endNote}>{t.today.allDoneLine}</span>
        )}
      </li>
    </ol>
  );
}

function Node({ step }: { step: TodayStep }): ReactNode {
  const Icon = step.state === 'done' ? CheckIcon : SECTION_ICON[step.section];
  return (
    <span aria-hidden="true" className={styles.node} data-section={step.section}>
      <Icon />
    </span>
  );
}

function SectionLabel({ section }: { section: TodayStep['section'] }): ReactNode {
  const { t } = useI18n();
  return (
    <span className={styles.section} data-section={section} lang={sectionLang(section)}>
      {t.sections[section]}
    </span>
  );
}

function CurrentStep({ step, blocked, onStart }: { step: TodayStep; blocked: boolean; onStart: (s: TodayStep) => void }): ReactNode {
  const { t } = useI18n();
  return (
    <section className={`${glass.strong} ${styles.card}`} aria-label={t.today.now(step.title)}>
      <div className={styles.cardText}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{step.title}</h2>
          <span className={styles.minutes}>{t.today.approxShort(step.minutes)}</span>
        </div>
        <span className={styles.cardSub}>
          <SectionLabel section={step.section} />
          {/* На широком экране время — в строке раздела, кнопка справа (web-T1). */}
          <span className={styles.cardSubMinutes}> · {t.today.approxShort(step.minutes)}</span>
        </span>
      </div>
      <button type="button" className={styles.start} onClick={() => onStart(step)}>
        {t.today.start}
      </button>
      {blocked && <p className={styles.blocked}>{t.today.needNetwork}</p>}
    </section>
  );
}

function StepRow({ step, blocked, onStart }: { step: TodayStep; blocked: boolean; onStart: (s: TodayStep) => void }): ReactNode {
  const { t } = useI18n();
  const done = step.state === 'done';
  const body = (
    <>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{step.title}</span>
        <SectionLabel section={step.section} />
      </span>
      <span className={styles.minutes}>{done ? t.today.short(step.minutes) : t.today.approxShort(step.minutes)}</span>
    </>
  );
  // Пройденный шаг — строка без перехода: повторить его — это «Своя тренировка», а не этот шаг.
  if (done) return <div className={styles.row}>{body}</div>;
  return (
    <div className={styles.rowWrap}>
      <Link
        to="/step/$stepId"
        params={{ stepId: step.id }}
        className={styles.row}
        onClick={(e) => {
          e.preventDefault();
          onStart(step);
        }}
      >
        {body}
      </Link>
      {blocked && <p className={styles.blocked}>{t.today.needNetwork}</p>}
    </div>
  );
}

/** Скелет ленты — та же геометрия, что у готового плана: при загрузке ничего не прыгает (макет T5-Loading). */
export function RibbonSkeleton(): ReactNode {
  return (
    <div aria-hidden="true" className={styles.ribbon}>
      <div className={styles.item} data-state="current">
        <span className={styles.line} />
        <span className={`${styles.node} ${styles.sk}`} />
        <div className={`${glass.strong} ${styles.card}`}>
          <span className={`${styles.skLine} ${styles.sk}`} data-w="title" />
          <span className={`${styles.skLine} ${styles.sk}`} data-w="sub" />
          <span className={`${styles.skButton} ${styles.sk}`} />
        </div>
      </div>
      <div className={styles.item} data-state="next">
        <span className={styles.line} />
        <span className={`${styles.node} ${styles.sk}`} />
        <div className={styles.rowText}>
          <span className={`${styles.skLine} ${styles.sk}`} data-w="row" />
          <span className={`${styles.skLine} ${styles.sk}`} data-w="sub" />
        </div>
      </div>
      <div className={styles.item} data-state="next">
        <span className={`${styles.node} ${styles.sk}`} />
        <div className={styles.rowText}>
          <span className={`${styles.skLine} ${styles.sk}`} data-w="short" />
          <span className={`${styles.skLine} ${styles.sk}`} data-w="sub" />
        </div>
      </div>
    </div>
  );
}
