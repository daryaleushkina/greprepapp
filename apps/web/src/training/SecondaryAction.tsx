import { secondaryButton } from '@tma.js/sdk-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useShell } from '../shellContext';
import styles from './Training.module.css';

export function TrainingSecondaryAction({ text, disabled, onClick }: { text: string; disabled: boolean; onClick: () => void }) {
  const { shell } = useShell();
  const native = shell === 'telegram' && secondaryButton.setParams.isAvailable();
  const handler = useRef(onClick);
  useLayoutEffect(() => { handler.current = () => { if (!disabled) onClick(); }; });
  useEffect(() => {
    if (!native) return;
    const apply = () => {
      const css = getComputedStyle(document.documentElement);
      const hex = (value: string): `#${string}` | undefined => {
        if (/^#[\da-f]{6}$/i.test(value)) return `#${value.slice(1)}`;
        // Сборщик CSS сокращает #FFFFFF до #fff и внутри токенов; SDK получает полный RGB.
        if (/^#[\da-f]{3}$/i.test(value)) return `#${value.slice(1).split('').map((digit) => digit + digit).join('')}`;
        return undefined;
      };
      const bgColor = hex(css.getPropertyValue('--color-surface').trim());
      const textColor = hex(css.getPropertyValue('--color-text').trim());
      secondaryButton.setParams.ifAvailable({ text, isVisible: true, isEnabled: !disabled, position: 'left',
        ...(bgColor && { bgColor }), ...(textColor && { textColor }) });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [native, text, disabled]);
  useEffect(() => {
    if (!native) return;
    const sub = secondaryButton.onClick.ifAvailable(() => handler.current());
    return () => { if (sub.ok) sub.data(); secondaryButton.setParams.ifAvailable({ isVisible: false }); };
  }, [native]);
  return native ? null : <button type="button" className={styles.secondaryAction} disabled={disabled} onClick={onClick}>{text}</button>;
}
