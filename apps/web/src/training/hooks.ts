import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { SESSION_KEY, useSession } from '../session/session';
import type { StoredTraining } from './model';
import { trainingRepository } from './repository';

/** Обновления своей и соседней вкладки читаются заново: кэш никогда не служит подтверждением отправки. */
export function useTrainingUpdates(): void {
  const client = useQueryClient();
  useEffect(() => trainingRepository.store.subscribe((change) => {
    if (change.kind === 'reports') return;
    if (change.kind === 'owner') {
      if (change.remote) void client.invalidateQueries({ queryKey: SESSION_KEY });
      void client.invalidateQueries({ queryKey: ['training'] });
      return;
    }
    void client.invalidateQueries({ predicate: (query) => {
      if (query.queryKey[0] !== 'training') return false;
      const id = query.queryKey[2];
      if (id === 'active') {
        const active = client.getQueryData<StoredTraining | null>(query.queryKey);
        return change.activeChanged || Boolean(active && change.ids.includes(active.session.id));
      }
      return typeof id === 'string' && change.ids.includes(id);
    } });
  }), [client]);
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
  const storage = useTrainingStorage();
  const query = useQuery({ queryKey: ['training', session.status === 'signedIn' ? session.user.id : null, 'active'],
    queryFn: async () => await trainingRepository.active() ?? null, enabled: session.status === 'signedIn' && storage === 'ready', networkMode: 'always' });
  return { ...query, data: storage === 'ready' ? query.data : null };
}

export function useStoredTraining(id: string) {
  const { session } = useSession();
  const storage = useTrainingStorage();
  const query = useQuery({ queryKey: ['training', session.status === 'signedIn' ? session.user.id : null, id],
    queryFn: async () => await trainingRepository.get(id) ?? null, enabled: session.status === 'signedIn' && storage === 'ready', networkMode: 'always' });
  return { ...query, data: storage === 'ready' ? query.data : null };
}

export function useTrainingStorage() { return useSyncExternalStore(trainingRepository.subscribe, trainingRepository.storageStatus); }
