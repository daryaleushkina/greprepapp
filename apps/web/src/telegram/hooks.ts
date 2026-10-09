// Кнопка «назад» в шапке Telegram, привязанная к экрану — по навыку telegram-mini-app (assets/hooks.ts):
// обработчик в ref, чтобы новая функция на каждый рендер не переподписывала кнопку; отписка обязательна —
// иначе обработчики копятся.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { backButton, swipeBehavior } from '@tma.js/sdk-react';

const SWIPE_RESTORE_KEY = 'greprep.training.swipes';

function rememberSetting(key: string, enabled: boolean): boolean {
  try {
    const stored = sessionStorage.getItem(key);
    const previous = stored === 'enabled' ? true : stored === 'disabled' ? false : enabled;
    sessionStorage.setItem(key, previous ? 'enabled' : 'disabled');
    return previous;
  } catch (error) {
    // Необязательное состояние оболочки: недоступное sessionStorage не прерывает сохранённую тренировку.
    console.warn('training shell state unavailable', error);
    return enabled;
  }
}

function forgetSetting(key: string): void {
  try { sessionStorage.removeItem(key); }
  catch (error) {
    // Необязательная очистка состояния оболочки; состояние оболочки уже восстановлено.
    console.warn('training shell state cleanup failed', error);
  }
}

/** Во время тренировки случайный свайп не закрывает мини-апп (решение Даши 08.10.2026). */
export function useTrainingSwipes(active: boolean): void {
  useLayoutEffect(() => {
    if (!active || !swipeBehavior.disableVertical.isAvailable()) return;
    // SDK сохраняет выключенные свайпы между загрузками; помним состояние до входа в сессию отдельно.
    const enabled = rememberSetting(SWIPE_RESTORE_KEY, swipeBehavior.isVerticalEnabled());
    swipeBehavior.disableVertical.ifAvailable();
    return () => { if (enabled) swipeBehavior.enableVertical.ifAvailable(); forgetSetting(SWIPE_RESTORE_KEY); };
  }, [active]);
}

export function useBackButton(onBack: (() => void) | null): void {
  const handler = useRef(onBack);
  useLayoutEffect(() => {
    handler.current = onBack;
  });
  const visible = onBack !== null;

  useEffect(() => {
    if (!visible) {
      backButton.hide.ifAvailable();
      return;
    }
    backButton.show.ifAvailable();
    const sub = backButton.onClick.ifAvailable(() => handler.current?.());
    return () => {
      if (sub.ok) sub.data();
      backButton.hide.ifAvailable();
    };
  }, [visible]);
}
