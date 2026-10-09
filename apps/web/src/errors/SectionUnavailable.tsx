import { useMatch, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { FullScreenStatus } from '../components/FullScreenStatus';
import { StatusScreen } from '../components/StatusScreen';
import { OfflineIcon } from '../components/icons';
import { useI18n } from '../i18n/i18n';
import { SectionLoadError } from '../sections';
// Общие стили разделов приходят с первым экраном: после обрыва достаточно повторить загрузку JS.
import styles from '../screens/screens.module.css';
import { Crashed } from './ErrorBoundary';

/** Ошибка загрузки пакета не выгружает уже открытый мини-апп и его кэш. */
export function SectionUnavailable({ error }: ErrorComponentProps) {
  const { t } = useI18n();
  const router = useRouter();
  const inTabs = useMatch({ from: '/app/tabs', shouldThrow: false });
  if (!(error instanceof SectionLoadError)) return <Crashed />;
  const Status = inTabs ? StatusScreen : FullScreenStatus;
  return <div className={styles.screen}><Status live icon={<OfflineIcon />} title={t.today.offlineTitle}
    action={{ label: t.today.retry, onClick: () => void router.invalidate() }} /></div>;
}
