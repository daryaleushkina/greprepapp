// Настройки (макет G2-Settings). В каркасе — выход и версия; язык, тема, размер текста и способы входа приходят
// своими частями (как в приложении Apple). «Выйти» — только на сайте: компьютер бывает общим, а в мини-аппе
// вход — это сам Telegram (комментарий в web-G2-Settings).
import { isApiError } from '@greprep/api-client';
import { useNavigate } from '@tanstack/react-router';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { APP_VERSION } from '../../config';
import { GRE_DISCLAIMER } from '../../i18n/dict';
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
  useLayoutEffect(() => setGlow('verbal'), [setGlow]);
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
      {/* Макеты G2 и web-G2: «Выйти» — тихая текстовая кнопка на одной строке с версией; в мини-аппе — версия по центру. */}
      <div className={styles.settingsFooter} data-shell={shell}>
        {shell === 'site' && (
          <button type="button" className={styles.textButton} onClick={() => void onSignOut()} disabled={busy}>
            {t.settings.signOut}
          </button>
        )}
        <p className={styles.version}>{t.settings.version(APP_VERSION || 'dev')}</p>
      </div>
      {failed && (
        <p className={styles.error} role="alert">
          {failed}
        </p>
      )}
      {/* Дисклеймер ETS — на входе сайта и в настройках каждого приложения (решение Даши 07.10.2026). */}
      <p className={styles.disclaimer} lang="en">
        {GRE_DISCLAIMER}
      </p>
    </div>
  );
}
