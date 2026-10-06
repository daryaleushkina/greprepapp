import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { miniApp } from '@tma.js/sdk-react';
import { useEffect, type ReactNode } from 'react';
import { ErrorBoundary } from './errors/ErrorBoundary';
import { I18nProvider } from './i18n/i18n';
import { browserLocale, telegramLocale, type Locale } from './i18n/locale';
import type { makeRouter } from './router';
import { SessionProvider, useSession } from './session/session';
import { ShellProvider, useShell } from './shellContext';
import type { Shell } from './shell';
import type { TelegramLaunch } from './telegram/sdk';

interface Props {
  queryClient: QueryClient;
  router: ReturnType<typeof makeRouter>;
  shell: Shell;
  launch: TelegramLaunch | null;
}

export function App({ queryClient, router, shell, launch }: Props): ReactNode {
  useEffect(() => {
    // После первого кадра с содержимым или скелетом: раньше — заглушка Telegram сменится пустым экраном (навык).
    if (shell === 'telegram') miniApp.ready.ifAvailable();
  }, [shell]);
  return (
    <QueryClientProvider client={queryClient}>
      <ShellProvider value={{ shell, launch }}>
        <SessionProvider launch={launch}>
          <Localized>
            <ErrorBoundary>
              <RouterProvider router={router} />
            </ErrorBoundary>
          </Localized>
        </SessionProvider>
      </ShellProvider>
    </QueryClientProvider>
  );
}

/** Язык интерфейса: вошёл — язык аккаунта; до входа — по Telegram или браузеру (i18n/locale.ts). */
function Localized({ children }: { children: ReactNode }): ReactNode {
  const { session } = useSession();
  const { launch } = useShell();
  let locale: Locale;
  if (session.status === 'signedIn') locale = session.user.locale;
  else if (launch) locale = telegramLocale(launch.languageCode);
  else locale = rememberedLocale() ?? browserLocale(navigator.languages);
  const accountLocale = session.status === 'signedIn' ? session.user.locale : null;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (accountLocale) rememberLocale(accountLocale);
  }, [accountLocale]);
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

/**
 * Язык последнего аккаунта на этом устройстве: после выхода или конца сессии экран входа остаётся на языке
 * человека, а не переключается на язык браузера. Хранилище может быть недоступно — тогда язык по браузеру.
 */
const LOCALE_KEY = 'greprep.locale';

function rememberedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return v === 'ru' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

function rememberLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Удобство, а не данные: без хранилища экран входа просто будет на языке браузера.
  }
}
