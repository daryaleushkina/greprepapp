// Запуск мини-аппа: порядок инициализации @tma.js/sdk-react 3.x — по навыку telegram-mini-app
// (assets/bootstrap.tsx). Цвета — свои, «Шагов» (решение Даши 05.10.2026): из темы Telegram берётся только,
// светлая она или тёмная, а шапке, фону и нижней панели клиента отдаётся наш фон, чтобы швов не было.
import { backButton, init, initData, miniApp, retrieveLaunchParams, themeParams, viewport } from '@tma.js/sdk-react';

export interface TelegramLaunch {
  /** Сырая initData — уходит на сервер, тот проверяет подпись ключом бота. */
  initDataRaw: string;
  /** Язык Telegram — для экрана загрузки до входа; после входа — язык аккаунта. */
  languageCode: string | undefined;
}

export type TelegramStart =
  | { kind: 'ok'; launch: TelegramLaunch }
  /** /tg/ открыли в обычном браузере — мини-апп без Telegram бесполезен, дорога на сайт. */
  | { kind: 'not-telegram' }
  /** Telegram открыл мини-апп, но запустить SDK не вышло (старый клиент, испорченные параметры запуска). */
  | { kind: 'failed'; error: unknown };

/** Признаки запуска из Telegram: параметры во фрагменте адреса или сохранённые SDK после перезагрузки. */
function launchedByTelegram(): boolean {
  if (location.hash.includes('tgWebApp')) return true;
  try {
    return sessionStorage.getItem('tapps/launchParams') !== null;
  } catch {
    return false;
  }
}

export async function startTelegram(): Promise<TelegramStart> {
  // Подмена окружения — в разработке и в сборке для e2e (VITE_TELEGRAM_MOCK=1), динамическим импортом: в боевую
  // сборку не попадает ни код, ни тема (условие вычисляется при сборке, ветка вырезается).
  if (import.meta.env.DEV || import.meta.env.VITE_TELEGRAM_MOCK === '1') {
    const { mockTelegramEnvForDev } = await import('./mockEnv');
    await mockTelegramEnvForDev();
  }
  try {
    init();
  } catch (error) {
    return launchedByTelegram() ? { kind: 'failed', error } : { kind: 'not-telegram' };
  }
  // Тема — первой: miniApp берёт из неё цвета. bindCssVars — здесь, вне React: второй вызов бросает, а StrictMode
  // зовёт эффекты дважды.
  themeParams.mount();
  miniApp.mount();
  themeParams.bindCssVars();
  miniApp.bindCssVars();
  initData.restore();
  backButton.mount.ifAvailable();

  if (viewport.mount.isAvailable()) {
    try {
      // Без срока промис ждёт ответа клиента сколько угодно (навык: так бывает на macOS).
      await viewport.mount({ timeout: 3000 });
      viewport.bindCssVars();
      viewport.expand.ifAvailable();
    } catch (e) {
      // Клиент не ответил — живём на запасных значениях CSS (env() и нули), но не падаем.
      console.warn('viewport.mount failed', e);
    }
  }

  await enterFullscreenOnPhone();

  const raw = initData.raw();
  if (!raw) return { kind: 'failed', error: new Error('Telegram launched the mini app without initData') };
  return { kind: 'ok', launch: { initDataRaw: raw, languageCode: initData.user()?.language_code } };
}

/**
 * Полноэкранный режим на телефонах (решение Даши 07.10.2026): так шапка Telegram — стеклянные круги поверх
 * содержимого, а свет раздела доходит до верха, как на холсте; отступ под кругами даёт content safe area. На
 * компьютере (Telegram Desktop, веб) — обычное окно.
 */
async function enterFullscreenOnPhone(): Promise<void> {
  let platform = '';
  try {
    platform = retrieveLaunchParams().tgWebAppPlatform;
  } catch {
    return;
  }
  if ((platform !== 'ios' && platform !== 'android') || !viewport.requestFullscreen.isAvailable() || viewport.isFullscreen()) return;
  try {
    await viewport.requestFullscreen();
  } catch (e) {
    // Клиент отказал (старая версия, уже полноэкранный) — остаёмся в обычном режиме, это не ошибка человека.
    console.warn('requestFullscreen failed', e);
  }
}

/**
 * Тема Telegram → data-theme на <html>: токены переключают цвета сами (design/tokens, generated/web). Светлая или
 * тёмная — по теме клиента (themeParams), а не miniApp.isDark: тот считается по фону мини-аппа, а фон мы задаём сами,
 * и после этого смена темы в Telegram до приложения не доходила бы.
 */
export function followTelegramTheme(): () => void {
  const apply = () => {
    document.documentElement.dataset.theme = themeParams.isDark() ? 'dark' : 'light';
    // Наш фон — шапке, фону под приложением и нижней панели клиента. Цвет читаем из токенов после смены темы.
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
    if (isHex(bg)) {
      miniApp.setHeaderColor.ifAvailable(bg);
      miniApp.setBgColor.ifAvailable(bg);
      miniApp.setBottomBarColor.ifAvailable(bg);
    }
  };
  apply();
  return themeParams.isDark.sub(apply);
}

function isHex(value: string): value is `#${string}` {
  return /^#[0-9a-f]{6}$/i.test(value);
}
