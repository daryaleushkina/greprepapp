// Кнопка «назад» в шапке Telegram, привязанная к экрану — по навыку telegram-mini-app (assets/hooks.ts):
// обработчик в ref, чтобы новая функция на каждый рендер не переподписывала кнопку; отписка обязательна —
// иначе обработчики копятся.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { backButton, swipeBehavior } from '@tma.js/sdk-react';

const SWIPE_RESTORE_KEY = 'greprep.training.swipes';

function rememberSwipes(enabled: boolean): boolean {
  try {
    const stored = sessionStorage.getItem(SWIPE_RESTORE_KEY);
    const previous = stored === 'enabled' ? true : stored === 'disabled' ? false : enabled;
    sessionStorage.setItem(SWIPE_RESTORE_KEY, previous ? 'enabled' : 'disabled');
    return previous;
  } catch (error) {
    // Необязательное состояние оболочки: недоступное sessionStorage не прерывает сохранённую тренировку.
    console.warn('training swipe state unavailable', error);
    return enabled;
  }
}

function forgetSwipes(): void {
  try { sessionStorage.removeItem(SWIPE_RESTORE_KEY); }
  catch (error) {
    // Необязательная очистка состояния оболочки; нативные свайпы уже восстановлены.
    console.warn('training swipe state cleanup failed', error);
  }
}

/** Во время тренировки случайный свайп не закрывает мини-апп (решение Даши 09.10.2026, задание части 2). */
export function useTrainingSwipes(active: boolean): void {
  useEffect(() => {
    if (!active || !swipeBehavior.disableVertical.isAvailable()) return;
    // SDK сохраняет выключенные свайпы между загрузками; помним состояние до входа в сессию отдельно.
    const enabled = rememberSwipes(swipeBehavior.isVerticalEnabled());
    swipeBehavior.disableVertical.ifAvailable();
    return () => { if (enabled) swipeBehavior.enableVertical.ifAvailable(); forgetSwipes(); };
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
