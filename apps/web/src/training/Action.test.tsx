import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ShellProvider } from '../shellContext';

const sdk = vi.hoisted(() => {
  const unsubscribe = vi.fn();
  return { unsubscribe, setParams: { isAvailable: vi.fn(() => true), ifAvailable: vi.fn() },
    onClick: { ifAvailable: vi.fn((_handler: () => void): { ok: boolean; data: () => void } => ({ ok: true, data: unsubscribe })) } };
});
vi.mock('@tma.js/sdk-react', () => ({ mainButton: sdk }));
import { TrainingAction } from './Action';

const action = (disabled = false, busy = false, onClick = vi.fn()) => <ShellProvider value={{ shell: 'telegram', launch: null }}>
  <TrainingAction text="Начать" disabled={disabled} busy={busy} onClick={onClick} />
</ShellProvider>;

test('главная кнопка Telegram показывает подпись, цвета и один обработчик, который отписывается', async () => {
  const onClick = vi.fn(); const result = await render(action(false, false, onClick));
  expect(sdk.setParams.ifAvailable).toHaveBeenCalledWith(expect.objectContaining({ text: 'Начать', isVisible: true, isEnabled: true, isLoaderVisible: false }));
  sdk.onClick.ifAvailable.mock.calls.at(-1)?.[0](); expect(onClick).toHaveBeenCalledTimes(1);
  await result.unmount(); expect(sdk.unsubscribe).toHaveBeenCalled(); expect(sdk.setParams.ifAvailable).toHaveBeenCalledWith({ isVisible: false });
});
for (const [disabled, busy] of [[true, false], [false, true]]) test(`кнопка не начинает при disabled=${disabled}, busy=${busy}`, async () => {
  const onClick = vi.fn(); await render(action(disabled, busy, onClick)); sdk.onClick.ifAvailable.mock.calls.at(-1)?.[0](); expect(onClick).not.toHaveBeenCalled();
});
test('старому клиенту остаётся кнопка страницы; цвета не из hex не передаются SDK', async () => {
  sdk.setParams.isAvailable.mockReturnValueOnce(false);
  const onClick = vi.fn(); const screen = await render(action(false, false, onClick)); await screen.getByRole('button', { name: 'Начать' }).click(); expect(onClick).toHaveBeenCalled();
  await screen.unmount();
  const html = document.documentElement; html.style.setProperty('--color-accent', 'rgb(0, 0, 0)'); html.style.setProperty('--color-on-accent', 'rgb(255, 255, 255)');
  sdk.onClick.ifAvailable.mockReturnValueOnce({ ok: false, data: () => {} });
  const next = await render(action()); expect(sdk.setParams.ifAvailable.mock.calls.at(-1)?.[0]).not.toHaveProperty('bgColor'); await next.unmount();
  html.style.removeProperty('--color-accent'); html.style.removeProperty('--color-on-accent');
});

test('при смене темы Telegram цвет главной кнопки следует за токенами', async () => {
  const html = document.documentElement;
  const before = html.dataset.theme;
  html.dataset.theme = 'light';
  const screen = await render(action());
  try {
    html.dataset.theme = 'dark';
    const expected = getComputedStyle(html).getPropertyValue('--color-accent').trim();
    await expect.poll(() => sdk.setParams.ifAvailable.mock.calls.at(-1)?.[0]?.bgColor).toBe(expected);
  } finally {
    await screen.unmount();
    if (before === undefined) delete html.dataset.theme; else html.dataset.theme = before;
  }
});
