import type { QueryClient } from '@tanstack/react-query';
import { onUnauthorized, SESSION_KEY, type SessionData } from '../session/session';
import type { Shell } from '../shell';
import { trainingRepository, type TrainingRepository } from './repository';

/** Единственная связь с авторизацией. Сбой устройства не меняет успешный ответ сервера о входе или выходе. */
export function bindTrainingSession(client: QueryClient, shell: Shell, repository: TrainingRepository = trainingRepository): () => void {
  let previous: string | undefined;
  repository.setUnauthorizedHandler((error) => onUnauthorized(client, error, shell === 'telegram'));
  const update = () => {
    const state = client.getQueryState<SessionData>(SESSION_KEY);
    const data = state?.data;
    const next = state?.status !== 'success' || state.fetchStatus === 'fetching' ? 'pending' :
      data?.user ? data.user.id : data?.signedOutByUser ? 'signOut' : 'expired';
    if (next === previous) return;
    previous = next;
    if (next === 'pending' || next === 'expired') repository.pause();
    else if (next === 'signOut') void repository.signOut();
    else void repository.signedIn(next);
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === SESSION_KEY[0]) update();
  });
  update();
  return () => { unsubscribe(); repository.pause(); repository.setUnauthorizedHandler(() => {}); };
}
