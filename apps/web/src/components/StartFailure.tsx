// Приложение не запустилось: Telegram открыл мини-апп, но SDK не принял параметры запуска (cause 'telegram'), или
// упало ещё до первого кадра (cause 'crash'). Экран с причиной и «Обновить» вместо белого листа. Сессии и
// маршрутов ещё нет — язык по браузеру.
import type { ReactNode } from 'react';
import { dictionaries } from '../i18n/dict';
import { I18nProvider } from '../i18n/i18n';
import { browserLocale } from '../i18n/locale';
import { FullScreenStatus } from './FullScreenStatus';

interface Props {
  cause: 'telegram' | 'crash';
  languages?: readonly string[];
  onReload?: () => void;
}

export function StartFailure({ cause, languages = navigator.languages, onReload = () => location.reload() }: Props): ReactNode {
  const locale = browserLocale(languages);
  const t = dictionaries[locale];
  return (
    <I18nProvider locale={locale}>
      <FullScreenStatus
        live
        title={cause === 'telegram' ? t.telegramFailed.title : t.crash.title}
        text={cause === 'telegram' ? t.telegramFailed.text : t.crash.text}
        action={{ label: t.crash.reload, onClick: onReload }}
      />
    </I18nProvider>
  );
}
