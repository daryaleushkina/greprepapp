import { isApiError } from '@greprep/api-client';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { onUnauthorized, SESSION_KEY } from './session/session';
import { trainingRepository } from './training/repository';
import type { Shell } from './shell';

/** Кэш запросов: сессия кончилась посреди работы (401 на запрос данных) — onUnauthorized решает, что делать. */
export function makeQueryClient(shell: Shell): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.queryKey[0] !== SESSION_KEY[0]) onUnauthorized(queryClient, error, shell === 'telegram');
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Повтор лечит только сеть; отказ сервера (401, 403, 400) повтором не лечится — сразу к обработке.
        retry: (count, e) => isApiError(e) && e.kind === 'network' && count < 3,
      },
    },
  });
  trainingRepository.setUnauthorizedHandler((error) => onUnauthorized(queryClient, error, shell === 'telegram'));
  return queryClient;
}
