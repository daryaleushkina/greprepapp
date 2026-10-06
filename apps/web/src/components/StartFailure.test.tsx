import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { StartFailure } from './StartFailure';

describe('экран сбоя запуска', () => {
  it('Telegram не смог запустить мини-апп — причина и «Обновить»', async () => {
    const reload = vi.fn();
    const screen = await render(<StartFailure cause="telegram" languages={['ru-RU']} onReload={reload} />);
    await expect.element(screen.getByRole('heading', { name: 'Не получилось открыть в Telegram' })).toBeVisible();
    await screen.getByRole('button', { name: 'Обновить' }).click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('падение до первого кадра, английский браузер — по-английски', async () => {
    const screen = await render(<StartFailure cause="crash" languages={['en-US']} onReload={() => {}} />);
    await expect.element(screen.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
  });
});
