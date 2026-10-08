import { mainButton } from '@tma.js/sdk-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useShell } from '../shellContext';
import styles from './Training.module.css';

function isHex(color: string): color is `#${string}` { return /^#[\da-f]{6}$/i.test(color); }

/** Нативная главная кнопка Telegram; старому клиенту остаётся такое же действие внутри страницы. */
export function TrainingAction({ text, disabled, busy = false, onClick }: { text: string; disabled: boolean; busy?: boolean; onClick: () => void }) {
  const { shell } = useShell();
  const native = shell === 'telegram' && mainButton.setParams.isAvailable();
  const handler = useRef(onClick);
  useLayoutEffect(() => { handler.current = () => { if (!disabled && !busy) onClick(); }; });
  useEffect(() => {
    if (!native) return;
    const apply = () => {
      const css = getComputedStyle(document.documentElement);
      const bgColor = css.getPropertyValue('--color-accent').trim();
      const textColor = css.getPropertyValue('--color-on-accent').trim();
      mainButton.setParams.ifAvailable({ text, isVisible: true, isEnabled: !disabled && !busy, isLoaderVisible: busy,
        ...(isHex(bgColor) && { bgColor }), ...(isHex(textColor) && { textColor }) });
    };
    apply();
    // Тема приходит мостом Telegram и меняет токены без рендера React.
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [native, text, disabled, busy]);
  useEffect(() => {
    if (!native) return;
    const sub = mainButton.onClick.ifAvailable(() => handler.current());
    return () => { if (sub.ok) sub.data(); mainButton.setParams.ifAvailable({ isVisible: false }); };
  }, [native]);
  return native ? null : <button type="button" className={styles.action} disabled={disabled || busy} aria-busy={busy} onClick={onClick}>{text}</button>;
}
