// Кнопка «назад» в шапке Telegram, привязанная к экрану — по навыку telegram-mini-app (assets/hooks.ts):
// обработчик в ref, чтобы новая функция на каждый рендер не переподписывала кнопку; отписка обязательна —
// иначе обработчики копятся.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { backButton } from '@tma.js/sdk-react';

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
