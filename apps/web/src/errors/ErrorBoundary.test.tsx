import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('./report', () => ({ reportError: vi.fn() }));

function Broken(): never {
  throw new Error('render failed');
}

describe('ErrorBoundary', () => {
  it('падение экрана — отчёт со стеком компонентов и «Обновить» вместо белого листа', async () => {
    const { reportError } = await import('./report');
    // React сам пишет пойманную ошибку в консоль — в выводе тестов она лишняя.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const screen = await render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    await expect.element(screen.getByText('Что-то пошло не так')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Обновить' })).toBeVisible();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'render failed', stack: expect.stringContaining('component stack') }));
    quiet.mockRestore();
  });
});
