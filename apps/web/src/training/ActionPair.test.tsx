import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import * as sdkRuntime from '@tma.js/sdk-react';
import { setTelegramRuntime } from '../telegram/runtime';
import { ShellProvider } from '../shellContext';

const sdk = vi.hoisted(() => {
  const button = () => ({ unsubscribe: vi.fn(), setParams: { isAvailable: vi.fn(() => true), ifAvailable: vi.fn() },
    onClick: { ifAvailable: vi.fn((_handler: () => void) => ({ ok: true, data: vi.fn() })) } });
  return { main: button(), secondary: button() };
});
vi.mock('@tma.js/sdk-react', () => ({ mainButton: sdk.main, secondaryButton: sdk.secondary }));
import { TrainingActions } from './Action';

const pair = (main = 'Начать', secondary: string | null = 'Назад', shell: 'site' | 'telegram' = 'telegram') => {
  setTelegramRuntime(shell === 'telegram' ? sdkRuntime : null);
  return <ShellProvider value={{ shell, launch: null }}>
  <TrainingActions primary={{ text: main, disabled: false, onClick: vi.fn() }} secondary={secondary === null ? undefined : { text: secondary, disabled: false, onClick: vi.fn() }} />
</ShellProvider>;
};
const position = () => sdk.secondary.setParams.ifAvailable.mock.calls.at(-1)?.[0]?.position;

test('пара: короткие подписи рядом, длинная главная или вторая — над главной', async () => {
  const screen = await render(pair());
  await expect.poll(position).toBe('left');
  await screen.rerender(pair('Повторить · 6 вопросов'));
  await expect.poll(position).toBe('top');
  await screen.rerender(pair('Начать', 'Вернуться к вопросу 12 из 50'));
  await expect.poll(position).toBe('top');
  await screen.rerender(pair());
  await expect.poll(position).toBe('left');
});

test('пара пересчитывает доступную ширину при повороте, без новых подписок onClick', async () => {
  const screen = await render(pair('Повторить · 6 вопросов'));
  await expect.poll(position).toBe('top');
  const mainSubscriptions = sdk.main.onClick.ifAvailable.mock.calls.length;
  const secondarySubscriptions = sdk.secondary.onClick.ifAvailable.mock.calls.length;
  const width = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800);
  window.dispatchEvent(new Event('resize'));
  await expect.poll(position).toBe('left');
  width.mockReturnValue(390); window.dispatchEvent(new Event('resize'));
  await expect.poll(position).toBe('top');
  expect(sdk.main.onClick.ifAvailable).toHaveBeenCalledTimes(mainSubscriptions);
  expect(sdk.secondary.onClick.ifAvailable).toHaveBeenCalledTimes(secondarySubscriptions);
  await screen.unmount();
});

test('на сайте и у старого клиента пара остаётся доступными кнопками страницы', async () => {
  const site = await render(pair('Повторить · 6 вопросов', 'Готово', 'site'));
  await expect.element(site.getByRole('button', { name: 'Готово' })).toBeVisible();
  await site.unmount();
  sdk.secondary.setParams.isAvailable.mockReturnValue(false);
  const mixed = await render(pair('Начать', 'Назад'));
  await expect.element(mixed.getByRole('button', { name: 'Назад' })).toBeVisible();
  await mixed.rerender(pair('Начать', null));
  await expect.element(mixed.getByRole('button', { name: 'Назад' })).not.toBeInTheDocument();
  await mixed.unmount();
});
