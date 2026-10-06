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
import { followTelegramTheme, startTelegram, type TelegramLaunch } from './telegram/sdk';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) throw new Error('#root is missing in index.html');
  const shell = detectShell(location.pathname);
  configureReporter(shell);
  installGlobalReporter();

  let launch: TelegramLaunch | null = null;
  if (shell === 'telegram') {
    launch = await startTelegram();
    if (!launch) {
      // /tg/ открыли в обычном браузере: мини-апп без Telegram бесполезен — на сайт, там свой вход.
      location.replace('/signin');
      return;
    }
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

bootstrap().catch((e: unknown) => reportError(e));
