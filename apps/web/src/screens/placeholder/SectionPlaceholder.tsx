// Раздел, которого в каркасе ещё нет (Слова, Экзамен): честно говорит, что здесь будет — те же слова, что в
// приложении Apple (MainView.swift, SectionPlaceholderView).
import { useEffect, type ReactNode } from 'react';
import { StatusScreen } from '../../components/StatusScreen';
import { useI18n } from '../../i18n/i18n';
import { useGlow } from '../../layout/AppLayout';
import styles from '../screens.module.css';

export function SectionPlaceholder({ section }: { section: 'words' | 'exam' }): ReactNode {
  const { t } = useI18n();
  const setGlow = useGlow();
  useEffect(() => setGlow(section), [section, setGlow]);
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{t.tabs[section]}</h1>
      <StatusScreen heading="h2" title={t.placeholder.soon} text={t.placeholder[section]} />
    </div>
  );
}
