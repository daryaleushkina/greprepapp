import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ShellProvider } from '../shellContext';

const sdk = vi.hoisted(() => ({ unsubscribe: vi.fn(),
  setParams: { isAvailable: vi.fn(() => true), ifAvailable: vi.fn() },
  onClick: { ifAvailable: vi.fn((_handler: () => void): { ok: boolean; data: () => void } => ({ ok: true, data: sdk.unsubscribe })) },
}));
vi.mock('@tma.js/sdk-react', () => ({ mainButton: sdk, secondaryButton: sdk }));
import { TrainingSecondaryAction } from './SecondaryAction';

const action = (disabled = false, onClick = vi.fn(), shell: 'site' | 'telegram' = 'telegram') => <ShellProvider value={{ shell, launch: null }}><TrainingSecondaryAction text="Не знаю" disabled={disabled} onClick={onClick} /></ShellProvider>;

test('SecondaryButton слева: одна подписка, обновление состояния и отписка', async () => {
  vi.clearAllMocks();
  const onClick = vi.fn(); const screen = await render(action(false, onClick));
  expect(sdk.setParams.ifAvailable).toHaveBeenCalledWith(expect.objectContaining({ text: 'Не знаю', position: 'left', isVisible: true, isEnabled: true }));
  const click = sdk.onClick.ifAvailable.mock.calls.at(-1)?.[0];
  click?.(); expect(onClick).toHaveBeenCalledTimes(1);
  await screen.rerender(action(true, onClick)); click?.(); expect(onClick).toHaveBeenCalledTimes(1);
  expect(sdk.onClick.ifAvailable).toHaveBeenCalledTimes(1);
  expect(sdk.setParams.ifAvailable).not.toHaveBeenCalledWith({ isVisible: false });
  await screen.unmount(); expect(sdk.unsubscribe).toHaveBeenCalled();
  expect(sdk.setParams.ifAvailable).toHaveBeenCalledWith({ isVisible: false });
});

test('SecondaryButton следует за темой; неподдерживаемые цвета не отправляются', async () => {
  const html = document.documentElement;
  const theme = html.dataset.theme;
  const screen = await render(action());
  try {
    html.dataset.theme = 'dark';
    const color = getComputedStyle(html).getPropertyValue('--color-surface').trim();
    await expect.poll(() => sdk.setParams.ifAvailable.mock.calls.at(-1)?.[0]?.bgColor).toBe(color);
    html.style.setProperty('--color-surface', 'Canvas'); html.style.setProperty('--color-text', 'CanvasText');
    html.dataset.theme = 'light';
    await expect.poll(() => sdk.setParams.ifAvailable.mock.calls.at(-1)?.[0]).not.toHaveProperty('bgColor');
    expect(sdk.setParams.ifAvailable.mock.calls.at(-1)?.[0]).not.toHaveProperty('textColor');
  } finally { await screen.unmount(); html.style.removeProperty('--color-surface'); html.style.removeProperty('--color-text'); if (theme === undefined) delete html.dataset.theme; else html.dataset.theme = theme; }
});

for (const shell of ['telegram', 'site'] as const) test(`fallback ${shell} выполняет то же действие`, async () => {
  sdk.setParams.isAvailable.mockReturnValueOnce(false);
  const onClick = vi.fn(); const screen = await render(action(false, onClick, shell));
  await screen.getByRole('button', { name: 'Не знаю' }).click(); expect(onClick).toHaveBeenCalled();
});

test('недоступная подписка безопасно убирается', async () => {
  sdk.onClick.ifAvailable.mockReturnValueOnce({ ok: false, data: () => {} });
  const screen = await render(action()); await screen.unmount();
});

test('сокращённый сборщиком #fff остаётся белым RGB у SecondaryButton', async () => {
  const html = document.documentElement; html.style.setProperty('--color-surface', '#fff');
  try {
    const screen = await render(action());
    expect(sdk.setParams.ifAvailable).toHaveBeenCalledWith(expect.objectContaining({ bgColor: '#ffffff' }));
    await screen.unmount();
  } finally { html.style.removeProperty('--color-surface'); }
});
