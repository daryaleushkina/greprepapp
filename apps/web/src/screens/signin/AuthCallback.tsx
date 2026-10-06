// Возврат от провайдера входа (/auth/callback?code&state): код меняется на сессию на сервере, кука ставится
// ответом, дальше — «Сегодня». Неудача — на экран входа с причиной.
import { isApiError, signInWithAuthorizationCode } from '@greprep/api-client';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { finishSignIn } from '../../auth/oidc';
import { StatusScreen } from '../../components/StatusScreen';
import { useI18n } from '../../i18n/i18n';
import type { SignInReason } from '../../router';
import { useSession } from '../../session/session';
import styles from './SignIn.module.css';

export function AuthCallback(): ReactNode {
  const { t, locale } = useI18n();
  const { signedIn } = useSession();
  const navigate = useNavigate();
  // Параметры — из адреса, который видит маршрутизатор (а не из location: в тестах и при basepath они разные).
  const search = useRouterState({ select: (s) => s.location.searchStr });
  // Попытка одноразовая (oidc.ts): второй прогон эффекта в StrictMode не должен её «съесть» повторно.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fail = (reason: SignInReason) => void navigate({ to: '/signin', search: { reason }, replace: true });
    const result = finishSignIn(new URLSearchParams(search), sessionStorage);
    if (!result.ok) {
      fail(result.reason === 'cancelled' ? 'cancelled' : 'failed');
      return;
    }
    const { attempt, code } = result;
    signInWithAuthorizationCode({
      provider: attempt.provider,
      code,
      codeVerifier: attempt.codeVerifier,
      redirectUri: attempt.redirectUri,
      nonce: attempt.nonce,
      transport: 'cookie',
      clientKind: 'web',
      locale,
    })
      .then(async (res) => {
        await signedIn(res.user);
        await navigate({ to: '/', replace: true });
      })
      .catch((e: unknown) => {
        console.error(e);
        if (isApiError(e) && e.kind === 'network') fail('offline');
        else if (isApiError(e) && e.code === 'too_many_requests') fail('tooMany');
        else fail('failed');
      });
  }, [locale, navigate, search, signedIn]);

  return (
    <div className={styles.page}>
      <main className={`app-shell ${styles.scroll}`}>
        <StatusScreen title={t.signIn.signingIn} />
      </main>
    </div>
  );
}
