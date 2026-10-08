import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSession } from '../session/session';
import { trainingRepository } from './repository';

/** Обновления своей и соседней вкладки читаются заново: кэш никогда не служит подтверждением отправки. */
export function useTrainingUpdates(): void {
  const client = useQueryClient();
  useEffect(() => trainingRepository.store.subscribe(() => { void client.invalidateQueries({ queryKey: ['training'] }); }), [client]);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      trainingRepository.requestSync();
      void client.invalidateQueries({ queryKey: ['training'] });
    };
    window.addEventListener('online', trainingRepository.requestSync);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', trainingRepository.requestSync);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [client]);
}

export function useActiveTraining() {
  const { session } = useSession();
  return useQuery({ queryKey: ['training', session.status === 'signedIn' ? session.user.id : null, 'active'],
    queryFn: async () => await trainingRepository.active() ?? null, enabled: session.status === 'signedIn', networkMode: 'always' });
}

export function useStoredTraining(id: string) {
  const { session } = useSession();
  return useQuery({ queryKey: ['training', session.status === 'signedIn' ? session.user.id : null, id],
    queryFn: async () => await trainingRepository.get(id) ?? null, enabled: session.status === 'signedIn', networkMode: 'always' });
}
