// Вход на сайте — один экран, три способа (PRODUCT.md, «Stack»: Telegram первым). В мини-аппе этого экрана нет:
// там человек опознан самим Telegram.
import { isApiError, signInForDevelopment } from '@greprep/api-client';
import { Navigate, useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { beginSignIn } from '../../auth/oidc';
import { BrandMark } from '../../components/BrandMark';
import { BRAND_NAME, DEV_SIGN_IN, providerConfig, type Provider } from '../../config';
import { GRE_DISCLAIMER } from '../../i18n/dict';
import { leaveTo } from '../../leave';
import { useI18n } from '../../i18n/i18n';
import type { SignInReason } from '../../router';
import { useSession } from '../../session/session';
import { useShell } from '../../shellContext';
import glass from '../../styles/glass.module.css';
import { SignInButtons } from './SignInButtons';
import styles from './SignIn.module.css';

export function SignInScreen(): ReactNode {
  const { t, locale } = useI18n();
  const { shell } = useShell();
  const { session, signedIn } = useSession();
  const { reason } = useSearch({ from: '/signin' });
  const navigate = useNavigate();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (shell === 'telegram' || session.status === 'signedIn') return <Navigate to="/" replace />;

  const reasonText: Record<SignInReason, string> = {
    expired: t.signIn.expired,
    cancelled: t.signIn.cancelled,
    failed: t.signIn.failed,
    offline: t.signIn.offline,
    tooMany: t.signIn.tooMany,
  };
  const shown = message ?? (reason ? reasonText[reason] : null);

  const onProvider = async (provider: Provider) => {
    const config = providerConfig(provider);
    if (!config) {
      setMessage(t.signIn.notConnected[provider]);
      return;
    }
    setBusy(provider);
    setMessage(null);
    try {
      leaveTo(await beginSignIn(provider, config, location.origin, sessionStorage));
    } catch (e) {
      // Хранилище вкладки недоступно (запрет в настройках браузера) — без него вход не завершить.
      console.error(e);
      setMessage(t.signIn.failed);
      setBusy(null);
    }
  };

  const onDev = async (name: string) => {
    setMessage(null);
    try {
      const res = await signInForDevelopment({ name, transport: 'cookie', clientKind: 'web', locale });
      await signedIn(res.user);
      await navigate({ to: '/', replace: true });
    } catch (e) {
      setMessage(isApiError(e) && e.kind === 'network' ? t.signIn.offline : t.signIn.failed);
    }
  };

  return (
    <div className={styles.page}>
      <main className={`app-shell ${styles.scroll}`}>
        <div className={styles.panel}>
          <div className={styles.intro}>
            <span className={`${glass.strong} ${styles.mark}`}>
              <BrandMark className={styles.glyph} />
            </span>
            <h1 className={styles.title}>{BRAND_NAME}</h1>
            <p className={styles.tagline}>{t.signIn.tagline}</p>
          </div>

          <div className={styles.actions}>
            {shown && (
              <p className={styles.message} role="alert">
                {shown}
              </p>
            )}
            <SignInButtons busy={busy} onPress={(p) => void onProvider(p)} />
            {DEV_SIGN_IN && <DevSignIn onSubmit={onDev} />}
            {/* Ссылки на документы появятся вместе с ними (задача #7). */}
            <p className={styles.legal}>{t.signIn.legal}</p>
            <p className={styles.legal} lang="en">
              {GRE_DISCLAIMER}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Вход подменой — только там, где сервер его пускает (локально, e2e, стенд); в бою сервер отвечает 404. */
function DevSignIn({ onSubmit }: { onSubmit: (name: string) => Promise<void> }): ReactNode {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <form
      className={styles.dev}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        setPending(true);
        void onSubmit(trimmed).finally(() => setPending(false));
      }}
    >
      <label className={styles.devLabel} htmlFor="dev-name">
        {t.signIn.devTitle}
      </label>
      <div className={styles.devRow}>
        <input
          id="dev-name"
          className={styles.devInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.signIn.devName}
          maxLength={64}
          autoComplete="off"
        />
        <button type="submit" className={styles.devSubmit} disabled={pending || !name.trim()}>
          {t.signIn.devSubmit}
        </button>
      </div>
    </form>
  );
}
