// Точка входа: выбрать оболочку по адресу (shell.ts), в мини-аппе — запустить SDK Telegram, затем приложение.
import '@greprep/tokens/generated/web/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installGlobalReporter, configureReporter, reportError } from './errors/report';
import { makeRouter } from './router';
import { makeQueryClient } from './queryClient';
import { detectShell } from './shell';
import { FullScreenStatus } from './components/FullScreenStatus';
import { dictionaries } from './i18n/dict';
import { I18nProvider } from './i18n/i18n';
import { browserLocale } from './i18n/locale';
import { followTelegramTheme, startTelegram, type TelegramLaunch } from './telegram/sdk';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) throw new Error('#root is missing in index.html');
  const shell = detectShell(location.pathname);
  configureReporter(shell);
  installGlobalReporter();

  let launch: TelegramLaunch | null = null;
  if (shell === 'telegram') {
    const started = await startTelegram();
    if (started.kind === 'not-telegram') {
      // /tg/ открыли в обычном браузере: мини-апп без Telegram бесполезен — на сайт, там свой вход.
      location.replace('/signin');
      return;
    }
    if (started.kind === 'failed') {
      reportError(started.error);
      renderStartFailure(container, 'telegram');
      return;
    }
    launch = started.launch;
    followTelegramTheme();
  }

  const queryClient = makeQueryClient(shell);
  const router = makeRouter({ queryClient, shell });

  createRoot(container, {
    onUncaughtError: (error) => reportError(error),
  }).render(
    <StrictMode>
      <App queryClient={queryClient} router={router} shell={shell} launch={launch} />
    </StrictMode>,
  );
}

/** Приложение не запустилось — экран с причиной и «Обновить», а не пустой лист. */
function renderStartFailure(container: HTMLElement, cause: 'telegram' | 'crash'): void {
  const locale = browserLocale(navigator.languages);
  const t = dictionaries[locale];
  createRoot(container).render(
    <I18nProvider locale={locale}>
      <FullScreenStatus
        live
        title={cause === 'telegram' ? t.telegramFailed.title : t.crash.title}
        text={cause === 'telegram' ? t.telegramFailed.text : t.crash.text}
        action={{ label: t.crash.reload, onClick: () => location.reload() }}
      />
    </I18nProvider>,
  );
}

bootstrap().catch((e: unknown) => {
  reportError(e);
  const container = document.getElementById('root');
  if (container) renderStartFailure(container, 'crash');
});
