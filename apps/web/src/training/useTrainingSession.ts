import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoredTraining } from './model';
import { trainingRepository } from './repository';
import { TrainingRules } from './rules';

const initialSelection = (training: StoredTraining) => training.answers[String(training.position)]?.optionIds ?? training.drafts?.[String(training.position)] ?? [];

/** Действия сериализуются на устройстве. Переход не опережает запись ответа, даже при двойном сигнале Telegram. */
export function useTrainingSession(incoming: StoredTraining) {
  const [training, setTraining] = useState(incoming);
  const [selection, setSelection] = useState(() => initialSelection(incoming));
  const [overview, setOverview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  const latest = useRef(training);
  const locked = useRef(false);
  const intent = useRef<(() => void) | undefined>(undefined);
  const shownAt = useRef(Date.now());
  useEffect(() => {
    if (locked.current) return;
    latest.current = incoming;
    setTraining(incoming);
    setSelection(initialSelection(incoming));
  }, [incoming]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      await action();
      const fresh = await trainingRepository.get(incoming.session.id);
      if (fresh) { latest.current = fresh; setTraining(fresh); setSelection(initialSelection(fresh)); }
    } catch {
      // Репозиторий уже сообщил о сбое без содержимого. Неподтверждённый выбор возвращается, экран объясняет отказ.
      setSelection(initialSelection(latest.current)); setFailed(true);
    } finally {
      locked.current = false; setBusy(false);
      const pending = intent.current; intent.current = undefined;
      pending?.();
    }
  }, [incoming.session.id]);
  useEffect(() => {
    if (training.session.mode !== 'check' || training.finish) return;
    const tick = () => {
      const currentTime = Date.now(); setNow(currentTime);
      if (TrainingRules.remainingSeconds(latest.current, currentTime) === 0) void run(() => trainingRepository.finish(incoming.session.id, true));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); window.removeEventListener('pageshow', tick); };
  }, [training.session.mode, training.finish, incoming.session.id, run]);

  const position = training.position;
  const question = training.session.items[position]!.question;
  const answer = training.answers[String(position)];
  const checkMode = training.session.mode === 'check';
  const revealed = !checkMode && Boolean(answer);
  const complete = TrainingRules.isComplete(question, selection);
  const flagged = answer?.flagged ?? false;
  const save = (ids: string[], dontKnow = false, flag = flagged) => trainingRepository.answer(training.session.id, {
    position, optionIds: ids, dontKnow, flagged: flag, answeredAt: new Date().toISOString(), elapsedMs: Math.max(0, Date.now() - shownAt.current),
  });
  const go = (next: number) => {
    if (next < 0 || next >= training.session.items.length || training.finish) return;
    void run(async () => { await trainingRepository.moveTo(training.session.id, next); shownAt.current = Date.now(); setOverview(false); });
  };
  const next = () => {
    if (!checkMode && !revealed) return;
    if (position < training.session.items.length - 1) go(position + 1);
    else if (checkMode) setOverview(true);
    else void run(() => trainingRepository.finish(training.session.id, false));
  };
  return { training, selection, overview, setOverview, busy, failed, position, question, answer, checkMode, revealed, complete, flagged,
    whenReady: (action: () => void) => { if (locked.current) intent.current ??= action; else action(); },
    remaining: TrainingRules.remainingSeconds(training, now), go, next,
    select: (id: string) => {
      if (locked.current || revealed || training.finish) return;
      const ids = TrainingRules.toggle(question, selection, id); setSelection(ids);
      void run(() => checkMode ? save(ids) : trainingRepository.draft(training.session.id, position, ids));
    },
    check: () => { if (complete && !revealed && !checkMode) void run(() => save(selection)); },
    dontKnow: () => { if (!revealed && !checkMode) void run(() => save([], true, false)); },
    flag: () => { if (checkMode && !training.finish) void run(() => save(selection, false, !flagged)); },
    finish: () => void run(() => trainingRepository.finish(training.session.id, false)),
  };
}
