// Возврат от провайдера входа (/auth/callback?code&state): код меняется на сессию на сервере, кука ставится
// ответом, дальше — исходный экран. Неудача — на экран входа с причиной и тем же адресом возврата.
import { isApiError, signInWithAuthorizationCode } from '@greprep/api-client';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { returnToSearch } from '../../auth/returnTo';
import { finishSignIn } from '../../auth/oidc';
import { reportError } from '../../errors/report';
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
    const fail = (reason: SignInReason, returnTo?: string) => void navigate({ to: '/signin', search: { reason, ...returnToSearch(returnTo) }, replace: true });
    let result: ReturnType<typeof finishSignIn>;
    try {
      result = finishSignIn(new URLSearchParams(search), sessionStorage);
    } catch (e) {
      // Хранилище вкладки запрещено настройками браузера — попытку не прочитать, вход не завершить.
      console.error(e);
      fail('failed');
      return;
    }
    if (!result.ok) {
      // Отмена — выбор человека; неверный возврат (чужой state, старая вкладка, подделка) — в журнал консоли.
      if (result.reason === 'invalid') console.warn('sign-in callback rejected: no matching attempt or bad parameters');
      fail(result.reason === 'cancelled' ? 'cancelled' : 'failed', result.returnTo);
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
        await navigate({ href: attempt.returnTo, replace: true });
      })
      .catch((e: unknown) => {
        console.error(e);
        // Ответ сервера не по договору — ошибка у нас: в отчёт (вход сломан, а человек видит только «не получилось»).
        if (isApiError(e) && e.kind === 'contract') reportError(e);
        if (isApiError(e) && e.kind === 'network') fail('offline', attempt.returnTo);
        else if (isApiError(e) && e.code === 'too_many_requests') fail('tooMany', attempt.returnTo);
        else fail('failed', attempt.returnTo);
      });
  }, [locale, navigate, search, signedIn]);

  return (
    <div className={styles.page}>
      <main className={`app-shell ${styles.scroll}`}>
        <StatusScreen live title={t.signIn.signingIn} />
      </main>
    </div>
  );
}
