// «Прогресс» — пока пустой, как в макете G6-ProgressEmpty; отсюда на телефоне — настройки (PRODUCT.md,
// «Навигация»: настройки — в «Прогрессе»). На сайте шире 600 px настройки — пункт панели, кнопки здесь нет.
import { Link } from '@tanstack/react-router';
import { useLayoutEffect, type ReactNode } from 'react';
import { SettingsIcon } from '../../components/icons';
import { StatusScreen } from '../../components/StatusScreen';
import { useI18n } from '../../i18n/i18n';
import { useGlow } from '../../layout/AppLayout';
import { useShell } from '../../shellContext';
import glass from '../../styles/glass.module.css';
import styles from '../screens.module.css';

export function ProgressScreen(): ReactNode {
  const { t } = useI18n();
  const { shell } = useShell();
  const setGlow = useGlow();
  // Экран вне раздела — свет Verbal, по умолчанию (описание токена glow-verbal).
  useLayoutEffect(() => setGlow('verbal'), [setGlow]);
  return (
    <div className={styles.screen}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{t.tabs.progress}</h1>
        <Link
          to="/settings"
          aria-label={t.tabs.settings}
          className={`${glass.glass} ${styles.circle} ${shell === 'site' ? styles.narrowOnly : ''}`}
        >
          <SettingsIcon />
        </Link>
      </div>
      <StatusScreen heading="h2" title={t.progress.emptyTitle} text={t.progress.emptyText} />
    </div>
  );
}
