// Запуск мини-аппа: порядок инициализации @tma.js/sdk-react 3.x — по навыку telegram-mini-app
// (assets/bootstrap.tsx). Цвета — свои, «Шагов» (решение Даши 05.10.2026): из темы Telegram берётся только,
// светлая она или тёмная, а шапке, фону и нижней панели клиента отдаётся наш фон, чтобы швов не было.
import { backButton, init, initData, miniApp, themeParams, viewport } from '@tma.js/sdk-react';

export interface TelegramLaunch {
  /** Сырая initData — уходит на сервер, тот проверяет подпись ключом бота. */
  initDataRaw: string;
  /** Язык Telegram — для экрана загрузки до входа; после входа — язык аккаунта. */
  languageCode: string | undefined;
}

/** null — это не Telegram (страницу /tg/ открыли в браузере) или клиент не прислал initData. */
export async function startTelegram(): Promise<TelegramLaunch | null> {
  // Подмена окружения — только в разработке и динамическим импортом: в сборку не попадает ни код, ни тема.
  if (import.meta.env.DEV) {
    const { mockTelegramEnvForDev } = await import('./mockEnv');
    await mockTelegramEnvForDev();
  }
  try {
    init();
  } catch {
    return null;
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

  const raw = initData.raw();
  if (!raw) return null;
  return { initDataRaw: raw, languageCode: initData.user()?.language_code };
}

/** Тема Telegram → data-theme на <html>: токены переключают цвета сами (design/tokens, generated/web). */
export function followTelegramTheme(): () => void {
  const apply = () => {
    document.documentElement.dataset.theme = miniApp.isDark() ? 'dark' : 'light';
    // Наш фон — шапке, фону под приложением и нижней панели клиента. Цвет читаем из токенов после смены темы.
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
    if (isHex(bg)) {
      miniApp.setHeaderColor.ifAvailable(bg);
      miniApp.setBgColor.ifAvailable(bg);
      miniApp.setBottomBarColor.ifAvailable(bg);
    }
  };
  apply();
  return miniApp.isDark.sub(apply);
}

function isHex(value: string): value is `#${string}` {
  return /^#[0-9a-f]{6}$/i.test(value);
}
