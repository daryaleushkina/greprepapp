import { useEffect, useRef, type ReactNode } from 'react';
import { StatusScreen } from '../components/StatusScreen';
import { useI18n } from '../i18n/i18n';
import { FocusLayout } from '../layout/AppLayout';
import { useShell } from '../shellContext';
import { useBackButton } from '../telegram/hooks';
import { useStoredTraining, useTrainingStorage } from './hooks';
import type { StoredTraining } from './model';
import styles from './Training.module.css';

/** Глубокая ссылка не обходит состояние сессии: разбор доступен только после её окончания. */
export function ReadTraining({ id, finishedOnly = false, wide = false, back, onBack, children }: {
  id: string; finishedOnly?: boolean; wide?: boolean; back: ReactNode; onBack: () => void; children: (training: StoredTraining) => ReactNode;
}) {
  const { t } = useI18n();
  const { shell } = useShell();
  const training = useStoredTraining(id);
  const storage = useTrainingStorage();
  useBackButton(shell === 'telegram' ? onBack : null);
  return <FocusLayout glow={training.data?.session.section ?? 'verbal'} training wide={wide} session>
    <div className={`${styles.screen} ${styles.readTraining}`} data-shell={shell} data-section={training.data?.session.section}>
      {shell === 'site' && back}
      {storage === 'unavailable' ? <StatusScreen title={t.training.training_storage_title} text={t.training.training_storage_message} /> :
        training.isPending ? <p role="status">{t.today.loading}</p> : !training.data || finishedOnly && !training.data.finish ?
          <StatusScreen title={t.training.training_missing_title} text={t.training.training_missing_message} /> : children(training.data)}
    </div>
  </FocusLayout>;
}

export function TrainingHeading({ children }: { children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }); }, []);
  return <h1 ref={heading} tabIndex={-1} className={styles.title}>{children}</h1>;
}
