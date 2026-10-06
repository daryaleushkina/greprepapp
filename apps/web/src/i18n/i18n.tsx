import { createContext, use, type ReactNode } from 'react';
import { dictionaries, type Dict } from './dict';
import type { Locale } from './locale';

interface I18n {
  locale: Locale;
  t: Dict;
}

const I18nContext = createContext<I18n>({ locale: 'ru', t: dictionaries.ru });

/** Язык интерфейса: до входа — по устройству (locale.ts), после — язык аккаунта. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }): ReactNode {
  return <I18nContext value={{ locale, t: dictionaries[locale] }}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  return use(I18nContext);
}
