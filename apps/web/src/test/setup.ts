// Компоненты проверяются со стилями приложения: токены, шрифт, основа — как в main.tsx.
import '@greprep/tokens/generated/web/tokens.css';
import '../styles/fonts.css';
import '../styles/base.css';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, vi } from 'vitest';
import { setTelegramRuntime } from '../telegram/runtime';
import { trainingRepository } from '../training/repository';
import { resetReauthForTests } from '../session/session';

beforeEach(async () => {
  // Подмена SDK в тестовом файле уже установлена; в бою его загружает только ветка Telegram в main.tsx.
  setTelegramRuntime(await import('@tma.js/sdk-react'));
});

afterEach(async () => {
  await trainingRepository.signOut();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessionStorage.clear();
  localStorage.clear();
  onlineManager.setOnline(true);
  resetReauthForTests();
});
