// Кнопка «назад» в шапке Telegram, привязанная к экрану — по навыку telegram-mini-app (assets/hooks.ts):
// обработчик в ref, чтобы новая функция на каждый рендер не переподписывала кнопку; отписка обязательна —
// иначе обработчики копятся.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useShell } from '../shellContext';
import { backButton, closingBehavior, swipeBehavior } from '@tma.js/sdk-react';

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

/** Во время тренировки случайный свайп не закрывает мини-апп (решение Даши 09.10.2026, задание части 2). */
export function useTrainingSwipes(active: boolean): void {
  useEffect(() => {
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

/** Асинхронная запись ещё не подтверждена диском: до её завершения закрытие требует подтверждения. */
export function useDraftCloseProtection(unsaved: boolean): void {
  const { shell } = useShell();
  useLayoutEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    if (unsaved) window.addEventListener('beforeunload', beforeUnload);
    let restore: (() => void) | undefined;
    if (shell === 'telegram') {
      closingBehavior.mount.ifAvailable();
      if (closingBehavior.enableConfirmation.isAvailable()) {
        // После перезагрузки SDK помнит наше подтверждение; восстанавливаем исходное состояние.
        const key = 'greprep.training.draft-close';
        const enabled = rememberSetting(key, closingBehavior.isConfirmationEnabled());
        restore = () => { if (!enabled) closingBehavior.disableConfirmation.ifAvailable(); forgetSetting(key); };
        if (unsaved) closingBehavior.enableConfirmation.ifAvailable(); else restore();
      }
    }
    return () => { window.removeEventListener('beforeunload', beforeUnload); restore?.(); };
  }, [shell, unsaved]);
}
