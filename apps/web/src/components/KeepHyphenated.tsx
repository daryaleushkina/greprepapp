// Слово с дефисом не рвётся на строки («по-» в конце строки читается плохо). Неразрывный дефис U+2011 не годится:
// в Onest его нет, и браузер рисует его чужим шрифтом поверх соседней буквы.
import { Fragment, type ReactNode } from 'react';
import styles from './KeepHyphenated.module.css';

export function KeepHyphenated({ text }: { text: string }): ReactNode {
  return text.split(/(\S+-\S+)/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className={styles.nowrap}>
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
