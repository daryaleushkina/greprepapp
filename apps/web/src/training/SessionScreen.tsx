import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { StatusScreen } from '../components/StatusScreen';
import { useI18n } from '../i18n/i18n';
import { FocusLayout } from '../layout/AppLayout';
import { useShell } from '../shellContext';
import { useBackButton } from '../telegram/hooks';
import { useStoredTraining } from './hooks';
import styles from './Training.module.css';

/** Вопрос и итог подключаются во второй части. Уже сейчас маршрут открывается из локальной записи. */
export function SessionScreen() {
  const { trainingId } = useParams({ from: '/app/training/$trainingId' });
  const { t } = useI18n();
  const { shell } = useShell();
  const navigate = useNavigate();
  const training = useStoredTraining(trainingId);
  useBackButton(shell === 'telegram' ? () => void navigate({ to: '/' }) : null);
  return <FocusLayout glow={training.data?.session.section ?? 'verbal'}><div className={styles.screen}>
    <Link to="/" className={styles.back}>{t.training.question_close}</Link>
    {training.isPending ? <p role="status">{t.today.loading}</p> : training.data ?
      <StatusScreen title={t.training.training_continue} text={t.placeholder.soon} /> :
      <StatusScreen title={t.training.training_missing_title} text={t.training.training_missing_message} />}
  </div></FocusLayout>;
}
