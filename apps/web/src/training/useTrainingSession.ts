import { useCallback, useEffect, useRef, useState } from 'react';
import type { GivenAnswer } from '@greprep/api-client';
import type { StoredTraining } from './model';
import { trainingRepository } from './repository';
import { TrainingRules } from './rules';

const initialSelection = (training: StoredTraining) => training.answers[String(training.position)]?.optionIds ?? training.drafts?.[String(training.position)] ?? [];

/** Выбор виден сразу, записи идут по порядку; отложенные переходы читают уже записанное состояние. */
export function useTrainingSession(incoming: StoredTraining) {
  const [training, setTraining] = useState(incoming);
  const [selection, setSelection] = useState(() => initialSelection(incoming));
  const [overview, updateOverview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  const latest = useRef(incoming);
  const persisted = useRef(incoming);
  const selected = useRef(selection);
  const selectionVersion = useRef(0);
  const overviewRef = useRef(false);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const releaseSync = useRef<(() => void) | undefined>(undefined);
  const expiredFinish = useRef<StoredTraining['finish']>(undefined);
  const shownAt = useRef(Date.now());
  const id = incoming.session.id;

  const showSelection = (ids: string[]) => { selected.current = ids; setSelection(ids); };
  const setOverview = (open: boolean) => { overviewRef.current = open; updateOverview(open); };
  useEffect(() => {
    if (pending.current || expiredFinish.current && !incoming.finish) return;
    latest.current = incoming; persisted.current = incoming;
    setTraining(incoming); selected.current = initialSelection(incoming); setSelection(selected.current);
  }, [incoming]);

  const run = useCallback((action: () => Promise<void>) => {
    const version = selectionVersion.current;
    if (!pending.current) releaseSync.current = trainingRepository.holdSync(id);
    pending.current++; setBusy(true);
    queue.current = queue.current.then(async () => {
      try {
        await action();
        const fresh = await trainingRepository.get(id);
        if (!fresh) throw new Error('training record unavailable after write');
        persisted.current = fresh;
        // Подтверждение раннего касания не перерисовывает более поздний выбор.
        const preserveSelection = selectionVersion.current !== version && fresh.position === latest.current.position;
        latest.current = { ...fresh,
          ...(preserveSelection && fresh.session.mode === 'check' && { answers: latest.current.answers }),
          ...(expiredFinish.current && { finish: expiredFinish.current }),
        };
        setTraining(latest.current);
        if (!preserveSelection) { selected.current = initialSelection(latest.current); setSelection(selected.current); }
        setFailed(false);
      } catch {
        // Репозиторий сообщает о сбое без содержимого; откатываем только выбор, которому нет новой замены.
        if (selectionVersion.current === version) {
          latest.current = { ...persisted.current, ...(expiredFinish.current && { finish: expiredFinish.current }) };
          setTraining(latest.current); selected.current = initialSelection(latest.current); setSelection(selected.current);
        }
        setFailed(true);
      } finally {
        pending.current--; setBusy(pending.current > 0);
        if (!pending.current) { releaseSync.current!(); releaseSync.current = undefined; }
      }
    });
  }, [id]);

  const expire = useCallback(() => {
    const current = latest.current;
    if (current.finish) return true;
    const currentTime = Date.now();
    if (TrainingRules.remainingSeconds(current, currentTime) !== 0) return false;
    // Итог не ждёт IndexedDB. Ответы, принятые до срока, дописываются перед концом очереди.
    expiredFinish.current = { finishedAt: new Date(current.startedAtMillis + current.session.timeLimitSeconds! * 1000).toISOString(), timedOut: true };
    latest.current = { ...current, finish: expiredFinish.current }; setTraining(latest.current); setNow(currentTime);
    run(() => trainingRepository.finish(id, true));
    return true;
  }, [id, run]);

  useEffect(() => {
    if (training.session.mode !== 'check' || training.finish) return;
    const tick = () => { setNow(Date.now()); expire(); };
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick); window.addEventListener('pageshow', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); window.removeEventListener('pageshow', tick); };
  }, [training.session.mode, training.finish, expire]);

  const makeAnswer = (ids: string[], dontKnow = false, flagged = latest.current.answers[String(latest.current.position)]?.flagged ?? false): GivenAnswer => ({
    position: latest.current.position, optionIds: ids, dontKnow, flagged,
    answeredAt: new Date(Date.now()).toISOString(), elapsedMs: Math.max(0, Date.now() - shownAt.current),
  });
  const save = async (ids: string[], dontKnow = false, flagged?: boolean) => {
    if (expire()) return;
    await trainingRepository.answer(id, makeAnswer(ids, dontKnow, flagged));
  };
  const move = async (next: number) => {
    const current = latest.current;
    if (expire() || next < 0 || next >= current.session.items.length) return;
    await trainingRepository.moveTo(id, next);
    shownAt.current = Date.now(); setOverview(false);
  };
  const advance = async () => {
    const current = latest.current;
    if (expire() || current.session.mode === 'practice' && !current.answers[String(current.position)]) return;
    if (current.position < current.session.items.length - 1) await move(current.position + 1);
    else if (current.session.mode === 'check') setOverview(true);
    else await trainingRepository.finish(id, false);
  };
  const check = async () => {
    const current = latest.current;
    if (current.session.mode === 'practice' && !current.answers[String(current.position)] && TrainingRules.isComplete(current.session.items[current.position]!.question, selected.current)) await save(selected.current);
  };
  const select = (optionId: string) => {
    const current = latest.current;
    if (expire() || current.session.mode === 'practice' && current.answers[String(current.position)]) return;
    const ids = TrainingRules.toggle(current.session.items[current.position]!.question, selected.current, optionId);
    selectionVersion.current++; showSelection(ids);
    if (current.session.mode === 'check') {
      const answer = makeAnswer(ids);
      latest.current = { ...current, answers: { ...current.answers, [current.position]: answer } }; setTraining(latest.current);
      run(() => trainingRepository.answer(id, answer));
    } else run(() => trainingRepository.draft(id, current.position, ids));
  };
  const position = training.position;
  const question = training.session.items[position]!.question;
  const answer = training.answers[String(position)];
  const checkMode = training.session.mode === 'check';
  const revealed = !checkMode && Boolean(answer);
  return { training, selection, overview, setOverview, busy, failed, position, question, answer, checkMode, revealed,
    complete: TrainingRules.isComplete(question, selection), flagged: answer?.flagged ?? false,
    remaining: TrainingRules.remainingSeconds(training, now), select,
    selectKey: (key: string) => {
      const groups = latest.current.session.items[latest.current.position]!.question.groups;
      const group = groups.find((group) => !group.options.some((option) => selected.current.includes(option.id))) ?? groups[0];
      const option = group?.options[key.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0)];
      if (option) select(option.id);
    },
    go: (next: number) => run(() => move(next)),
    previous: () => run(() => move(latest.current.position - 1)),
    next: () => run(advance),
    primary: () => run(async () => {
      if (expire()) return;
      if (overviewRef.current) await trainingRepository.finish(id, false);
      else if (latest.current.session.mode === 'check' || latest.current.answers[String(latest.current.position)]) await advance();
      else await check();
    }),
    dontKnow: () => run(async () => {
      const current = latest.current;
      if (current.session.mode === 'practice' && !current.answers[String(current.position)]) await save([], true, false);
    }),
    flag: () => {
      if (expire() || latest.current.session.mode !== 'check') return;
      run(() => save(selected.current, false, !latest.current.answers[String(latest.current.position)]?.flagged));
    },
  };
}
