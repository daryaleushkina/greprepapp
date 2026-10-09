import { telegramRuntime } from '../telegram/runtime';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShell } from '../shellContext';
import styles from './Training.module.css';

interface ActionProps { text: string; disabled: boolean; busy?: boolean; onClick: () => void }
const SecondaryPosition = createContext<'left' | 'top'>('left');

function hex(value: string): `#${string}` | undefined {
  if (/^#[\da-f]{6}$/i.test(value)) return `#${value.slice(1)}`;
  // Минификатор сокращает токены до #fff; SDK получает полный RGB у обеих кнопок.
  if (/^#[\da-f]{3}$/i.test(value)) return `#${value.slice(1).split('').map((digit) => digit + digit).join('')}`;
  return undefined;
}

/** Одна обвязка параметров, темы и подписки для обеих нативных кнопок. */
function TrainingButton({ kind, text, disabled, busy = false, onClick }: ActionProps & { kind: 'main' | 'secondary' }) {
  const { shell } = useShell();
  const sdk = shell === 'telegram' ? telegramRuntime() : null;
  const button = kind === 'main' ? sdk?.mainButton : sdk?.secondaryButton;
  const native = Boolean(button?.setParams.isAvailable());
  const position = useContext(SecondaryPosition);
  const handler = useRef(onClick);
  useLayoutEffect(() => { handler.current = () => { if (!disabled && !busy) onClick(); }; });
  useEffect(() => {
    if (!native || !sdk) return;
    const apply = () => {
      const css = getComputedStyle(document.documentElement);
      const bgColor = hex(css.getPropertyValue(kind === 'main' ? '--color-accent' : '--color-surface').trim());
      const textColor = hex(css.getPropertyValue(kind === 'main' ? '--color-on-accent' : '--color-text').trim());
      const params = { text, isVisible: true, isEnabled: !disabled && !busy, isLoaderVisible: busy,
        ...(bgColor && { bgColor }), ...(textColor && { textColor }) };
      if (kind === 'main') sdk.mainButton.setParams.ifAvailable(params);
      else sdk.secondaryButton.setParams.ifAvailable({ ...params, position });
    };
    apply();
    // Тема приходит мостом Telegram и меняет токены без рендера React.
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [native, sdk, kind, text, disabled, busy, position]);
  useEffect(() => {
    if (!native || !button) return;
    const sub = button.onClick.ifAvailable(() => handler.current());
    return () => { if (sub.ok) sub.data(); button.setParams.ifAvailable({ isVisible: false }); };
  }, [native, button]);
  return native ? null : <button type="button" className={kind === 'main' ? styles.action : styles.secondaryAction} disabled={disabled || busy} aria-busy={busy} onClick={onClick}>{text}</button>;
}

/** Нативная главная кнопка Telegram; старому клиенту остаётся такое же действие внутри страницы. */
export function TrainingAction(props: ActionProps) { return <TrainingButton kind="main" {...props} />; }
export function TrainingSecondaryAction(props: ActionProps) { return <TrainingButton kind="secondary" {...props} />; }

export function TrainingActions({ primary, secondary }: { primary: ActionProps; secondary?: ActionProps }) {
  const { shell } = useShell();
  const [position, setPosition] = useState<'left' | 'top'>('left');
  const labels = useRef<HTMLDivElement>(null);
  const sdk = shell === 'telegram' ? telegramRuntime() : null;
  const nativePair = Boolean(secondary && sdk?.mainButton.setParams.isAvailable() && sdk.secondaryButton.setParams.isAvailable());
  useLayoutEffect(() => {
    if (!nativePair) return;
    const measure = () => {
      const css = getComputedStyle(document.documentElement);
      const gutter = Number.parseFloat(css.getPropertyValue('--space-8'));
      const halfWidth = (document.documentElement.clientWidth - gutter * 3) / 2;
      // В Telegram пара делит ширину пополам. Проверяем обе подписи системным шрифтом, включая запас по краям.
      const fits = [...labels.current!.children].every((label) => label.getBoundingClientRect().width <= halfWidth);
      setPosition(fits ? 'left' : 'top');
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [nativePair, primary.text, secondary?.text]);
  return <SecondaryPosition.Provider value={position}>
    <div className={styles.actions}>
      {nativePair && <div ref={labels} className={styles.nativeMeasure} aria-hidden="true"><span>{primary.text}</span><span>{secondary?.text}</span></div>}
      {secondary && <TrainingSecondaryAction {...secondary} />}
      <TrainingAction {...primary} />
    </div>
  </SecondaryPosition.Provider>;
}
