// Падение экрана: отчёт на сервер и тихий экран «Что-то пошло не так» с «Обновить» вместо белого листа.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StatusScreen } from '../components/StatusScreen';
import { useI18n } from '../i18n/i18n';
import { reportError } from './report';

interface State {
  crashed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (info.componentStack) err.stack = `${err.stack ?? ''}\n--- component stack ---${info.componentStack}`;
    reportError(err);
  }

  override render(): ReactNode {
    return this.state.crashed ? <Crashed /> : this.props.children;
  }
}

function Crashed(): ReactNode {
  const { t } = useI18n();
  return (
    <main className="app-shell">
      <StatusScreen title={t.crash.title} text={t.crash.text} action={{ label: t.crash.reload, onClick: () => location.reload() }} />
    </main>
  );
}
