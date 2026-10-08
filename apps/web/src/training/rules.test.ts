import { readFileSync } from 'node:fs';
import { schemas } from '@greprep/api-client';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { storedTraining } from './model';
import { TrainingRules } from './rules';

const review = z.object({ topicId: z.string(), title: schemas.LocalizedText, mistakes: z.number(), positions: z.array(z.number()) });
const clock = z.object({ name: z.string(), session: schemas.TrainingSession, startedAtMillis: z.number(), nowMillis: z.number().optional(),
  finish: schemas.TrainingFinish.optional(), remainingSeconds: z.number().optional(), durationSeconds: z.number() });
const fixture = z.object({
  answers: z.array(z.discriminatedUnion('badAnswer', [
    z.object({ name: z.string(), question: schemas.Question, answer: schemas.GivenAnswer, correct: z.boolean(), badAnswer: z.literal(false) }),
    // Серверные отказы клиент пропускает целиком: такой ввод может не соответствовать даже форме DTO.
    z.object({ name: z.string(), badAnswer: z.literal(true) }),
  ])),
  summaries: z.array(clock.omit({ durationSeconds: true }).extend({ expected: z.object({ correct: z.number(), total: z.number(), unanswered: z.number(), durationSeconds: z.number(), review: z.array(review) }) })),
  pace: z.array(z.object({ name: z.string(), section: schemas.Section, count: z.number(), paceSeconds: z.number(), timeLimitSeconds: z.number() })),
  toggles: z.array(z.object({ name: z.string(), question: schemas.Question, selection: z.array(z.string()), optionId: z.string(), expected: z.array(z.string()) })),
  missingGroups: z.array(z.object({ name: z.string(), question: schemas.Question, selection: z.array(z.string()), expected: z.array(z.number()), complete: z.boolean() })),
  clocks: z.array(clock),
  minutes: z.array(z.object({ name: z.string(), durationSeconds: z.number(), limitSeconds: z.number().optional(), minutes: z.number(), limitMinutes: z.number().optional() })),
  repeats: z.array(z.object({ name: z.string(), mistakes: z.number(), count: z.number() })),
}).parse(JSON.parse(readFileSync(new URL('../../../../api/conformance/training-rules.json', import.meta.url), 'utf8')));

describe('общий договор правил тренировок', () => {
  for (const c of fixture.answers.filter((c) => !c.badAnswer)) test(c.name, () => expect(TrainingRules.isCorrect(c.question, c.answer.optionIds)).toBe(c.correct));
  for (const c of fixture.summaries) test(c.name, () => {
    const t = { ...storedTraining(c.session, c.startedAtMillis), finish: c.finish };
    expect(TrainingRules.result(t)).toEqual(c.expected);
  });
  for (const c of fixture.pace) test(c.name, () => expect(TrainingRules.timeLimitSeconds(c.count, c.paceSeconds)).toBe(c.timeLimitSeconds));
  for (const c of fixture.toggles) test(c.name, () => expect(TrainingRules.toggle(c.question, c.selection, c.optionId)).toEqual(c.expected));
  for (const c of fixture.missingGroups) test(c.name, () => {
    expect(TrainingRules.missingGroups(c.question, c.selection)).toEqual(c.expected);
    expect(TrainingRules.isComplete(c.question, c.selection)).toBe(c.complete);
  });
  for (const c of fixture.clocks) test(c.name, () => {
    const t = { ...storedTraining(c.session, c.startedAtMillis), finish: c.finish };
    expect(TrainingRules.remainingSeconds(t, c.nowMillis ?? c.startedAtMillis)).toBe(c.remainingSeconds);
    expect(TrainingRules.durationSeconds(t)).toBe(c.durationSeconds);
  });
  for (const c of fixture.minutes) test(c.name, () => expect(TrainingRules.summaryMinutes(c.durationSeconds, c.limitSeconds)).toEqual({ minutes: c.minutes, limitMinutes: c.limitMinutes }));
  for (const c of fixture.repeats) test(c.name, () => expect(TrainingRules.repeatCount(c.mistakes)).toBe(c.count));
});
