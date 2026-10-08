import { expect, test } from 'vitest';
import { givenAnswer, trainingSession } from '../test/training';
import { storedTraining } from './model';

test('полученные с сервера ответы и конец не ставятся в очередь повторно', () => {
  const session = trainingSession();
  session.finishedAt = '2026-10-06T09:02:00Z';
  session.items[0] = { ...session.items[0]!, answer: givenAnswer() };
  expect(storedTraining(session, 1)).toMatchObject({ answers: { 0: givenAnswer() }, unsent: [], finishSent: true, finish: { finishedAt: session.finishedAt, timedOut: false } });
});
