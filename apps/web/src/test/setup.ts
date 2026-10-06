// Компоненты проверяются со стилями приложения: токены, шрифт, основа — как в main.tsx.
import '@greprep/tokens/generated/web/tokens.css';
import '../styles/fonts.css';
import '../styles/base.css';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, vi } from 'vitest';
import { resetReauthForTests } from '../session/session';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessionStorage.clear();
  localStorage.clear();
  onlineManager.setOnline(true);
  resetReauthForTests();
});
