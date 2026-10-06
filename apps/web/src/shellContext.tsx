import { createContext, use, type ReactNode } from 'react';
import type { Shell } from './shell';
import type { TelegramLaunch } from './telegram/sdk';

interface ShellInfo {
  shell: Shell;
  /** Запуск мини-аппа; null на сайте. */
  launch: TelegramLaunch | null;
}

const ShellContext = createContext<ShellInfo>({ shell: 'site', launch: null });

export function ShellProvider({ value, children }: { value: ShellInfo; children: ReactNode }): ReactNode {
  return <ShellContext value={value}>{children}</ShellContext>;
}

export function useShell(): ShellInfo {
  return use(ShellContext);
}
