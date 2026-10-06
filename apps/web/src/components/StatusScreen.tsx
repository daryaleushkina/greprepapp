// Тихий экран состояния: «Скоро», «Нет сети», «Не получилось» — заголовок, одна фраза и одно действие.
import type { ReactNode } from 'react';
import styles from './StatusScreen.module.css';

interface Props {
  title: string;
  text?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Заголовок страницы (h1) — когда экран состояния стоит вместо всего экрана, а не внутри раздела. */
  heading?: 'h1' | 'h2';
  /** Смена состояния («Нет сети», «Не получилось») — диктор её объявит; постоянная заглушка — нет. */
  live?: boolean;
}

export function StatusScreen({ title, text, icon, action, heading = 'h1', live = false }: Props): ReactNode {
  const Heading = heading;
  return (
    <section className={styles.status} {...(live && { role: 'status' })}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <Heading className={styles.title}>{title}</Heading>
      {text && <p className={styles.text}>{text}</p>}
      {action && (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </section>
  );
}
