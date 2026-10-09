import { expect, it, vi } from 'vitest';

it('до запуска Telegram SDK отсутствует; запуск передаёт общим компонентам тот же экземпляр', async () => {
  vi.resetModules();
  const { telegramRuntime, setTelegramRuntime } = await import('./runtime');
  expect(telegramRuntime()).toBeNull();
  const sdk = await import('@tma.js/sdk-react');
  setTelegramRuntime(sdk);
  expect(telegramRuntime()).toBe(sdk);
});
