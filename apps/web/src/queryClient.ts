import { QueryCache, QueryClient } from '@tanstack/react-query';
import { onUnauthorized, SESSION_KEY } from './session/session';
import type { Shell } from './shell';

/** Кэш запросов: сессия кончилась посреди работы (401 на запрос данных) — onUnauthorized решает, что делать. */
export function makeQueryClient(shell: Shell): QueryClient {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.queryKey[0] !== SESSION_KEY[0]) onUnauthorized(queryClient, error, shell === 'telegram');
      },
    }),
    defaultOptions: { queries: { staleTime: 30_000 } },
  });
  return queryClient;
}
