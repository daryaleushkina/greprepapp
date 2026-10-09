import { sectionsModuleUrl } from './sectionModuleUrl';

/** Разделы вне первого экрана: один небольшой пакет, общий для всех вкладок. */
export class SectionLoadError extends Error {
  constructor(cause: unknown) {
    super('section module unavailable', { cause });
  }
}

let loaded: Promise<typeof import('./sections.lazy')> | undefined;
let attempt = 0;

export function loadSections(): Promise<typeof import('./sections.lazy')> {
  // Успех и запрос в пути общие для фоновой догрузки и маршрутов; отказ не запрещает следующую попытку.
  if (loaded) return loaded;
  const url = new URL(sectionsModuleUrl, location.origin);
  url.searchParams.set('attempt', String(attempt++));
  // URL — своего скомпилированного модуля; успешный импорт сохраняется, а отказ не отравляет следующий.
  loaded = import(/* @vite-ignore */ url.href).catch((error: unknown) => {
    loaded = undefined;
    throw new SectionLoadError(error);
  });
  return loaded;
}
