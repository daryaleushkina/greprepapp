// Шаг из ленты «Сегодня». Тренировки, слова и экзамен — следующие части (ROADMAP §5); пока экран говорит, что
// здесь начнётся шаг. Режим фокуса: без вкладок, «назад» — кнопкой Telegram или ссылкой на сайте.
import { useGetToday } from '@greprep/api-client';
import { useNavigate, useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { StatusScreen } from '../../components/StatusScreen';
import { useI18n } from '../../i18n/i18n';
import { BackLink, FocusLayout } from '../../layout/AppLayout';
import { useSession } from '../../session/session';
import { useShell } from '../../shellContext';
import { useBackButton } from '../../telegram/hooks';
import styles from '../screens.module.css';

export function StepScreen(): ReactNode {
  const { t } = useI18n();
  const { shell } = useShell();
  const { session } = useSession();
  const navigate = useNavigate();
  const { stepId } = useParams({ from: '/app/step/$stepId' });
  // План уже в кэше с «Сегодня»; открыли шаг по ссылке — подгрузится тот же запрос.
  const today = useGetToday({ query: { enabled: session.status === 'signedIn' } });
  const step = today.data?.steps.find((s) => s.id === stepId);
  useBackButton(shell === 'telegram' ? () => void navigate({ to: '/' }) : null);
  return (
    <FocusLayout glow={step?.section ?? 'verbal'}>
      <div className={styles.screen}>
        {shell === 'site' && <BackLink fallback="/" />}
        <StatusScreen title={step?.title ?? t.placeholder.soon} text={t.placeholder.step} />
      </div>
    </FocusLayout>
  );
}
