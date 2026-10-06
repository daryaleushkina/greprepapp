// Экран состояния вместо всего приложения («Не получилось войти», «Что-то пошло не так»): та же оболочка прокрутки
// и те же отступы, что у экранов, — вырез, кнопки Telegram в полноэкранном режиме, боковые поля.
import type { ComponentProps, ReactNode } from 'react';
import styles from './FullScreenStatus.module.css';
import { StatusScreen } from './StatusScreen';

export function FullScreenStatus(props: ComponentProps<typeof StatusScreen>): ReactNode {
  return (
    <main className={`app-shell ${styles.full}`}>
      <StatusScreen {...props} />
    </main>
  );
}
