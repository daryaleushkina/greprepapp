// Настройки (макет G2-Settings). В каркасе — выход и версия; язык, тема, размер текста и способы входа приходят
// своими частями (как в приложении Apple). «Выйти» — только на сайте: компьютер бывает общим, а в мини-аппе
// вход — это сам Telegram (комментарий в web-G2-Settings).
import { isApiError } from '@greprep/api-client';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { APP_VERSION } from '../../config';
import { useI18n } from '../../i18n/i18n';
import { BackLink, useGlow } from '../../layout/AppLayout';
import { useSession } from '../../session/session';
import { useShell } from '../../shellContext';
import { useBackButton } from '../../telegram/hooks';
import styles from '../screens.module.css';

export function SettingsScreen(): ReactNode {
  const { t } = useI18n();
  const { shell } = useShell();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const setGlow = useGlow();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setGlow('exam'), [setGlow]);
  useBackButton(shell === 'telegram' ? () => void navigate({ to: '/progress' }) : null);

  const onSignOut = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await signOut();
      await navigate({ to: '/signin', replace: true });
    } catch (e) {
      // Не вышли — экран как был и причина: кука жива, значит человек всё ещё вошёл (CLAUDE.md, «Ошибку не глотать»).
      setFailed(isApiError(e) && e.kind === 'network' ? t.settings.signOutOffline : t.settings.signOutFailed);
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      {shell === 'site' && <BackLink fallback="/progress" narrowOnly />}
      <h1 className={styles.title}>{t.tabs.settings}</h1>
      {shell === 'site' && (
        <div className={styles.group}>
          <button type="button" className={styles.groupRow} onClick={() => void onSignOut()} disabled={busy}>
            {t.settings.signOut}
          </button>
        </div>
      )}
      {failed && (
        <p className={styles.error} role="alert">
          {failed}
        </p>
      )}
      <p className={styles.footnote}>{t.settings.version(APP_VERSION || 'dev')}</p>
    </div>
  );
}
