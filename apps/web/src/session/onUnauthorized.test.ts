import { ApiError } from '@greprep/api-client';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentAuthTag, onUnauthorized, resetReauthForTests } from './session';

describe('onUnauthorized в мини-аппе', () => {
  it('поздний 401 от запроса со старым токеном не сбрасывает свежий и не входит заново', () => {
    resetReauthForTests();
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    const stale = new ApiError('server', { status: 401, code: 'unauthorized', message: 'x', authTag: currentAuthTag() - 1 });
    onUnauthorized(queryClient, stale, true);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('401 по текущему токену — вход заново', () => {
    resetReauthForTests();
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
    onUnauthorized(queryClient, new ApiError('server', { status: 401, code: 'unauthorized', message: 'x', authTag: currentAuthTag() }), true);
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['session'] });
  });
});

describe('вход заново — не чаще раза в 10 с', () => {
  afterEach(() => vi.useRealTimers());

  it('второй 401 через 5 с не входит заново, через 11 с — входит', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    resetReauthForTests();
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
    const unauthorized = () => new ApiError('server', { status: 401, code: 'unauthorized', message: 'x', authTag: currentAuthTag() });
    onUnauthorized(queryClient, unauthorized(), true);
    vi.advanceTimersByTime(5_000);
    onUnauthorized(queryClient, unauthorized(), true);
    expect(refetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6_000);
    onUnauthorized(queryClient, unauthorized(), true);
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('не 401 и не ApiError — ничего не делает', () => {
    resetReauthForTests();
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    onUnauthorized(queryClient, new Error('x'), true);
    onUnauthorized(queryClient, new ApiError('server', { status: 500, code: 'internal', message: 'x' }), true);
    expect(refetch).not.toHaveBeenCalled();
  });
});
