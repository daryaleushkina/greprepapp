import { schemas } from '@greprep/api-client';
import { z } from 'zod';

/** Ответы и весь разбор остаются на устройстве: начатой тренировке сеть уже не нужна. */
export const storedTrainingSchema = z.object({
  session: schemas.TrainingSession,
  startedAtMillis: z.number().int(),
  answers: z.record(z.string(), schemas.GivenAnswer),
  unsent: z.array(z.number().int().nonnegative()),
  position: z.number().int().nonnegative(),
  finish: schemas.TrainingFinish.optional(),
  finishSent: z.boolean(),
}).refine((t) => t.position < t.session.items.length &&
  t.session.items.every((item, index) => item.position === index) &&
  Object.entries(t.answers).every(([key, answer]) => key === String(answer.position) && answer.position < t.session.items.length) &&
  t.unsent.every((position) => t.answers[String(position)] !== undefined), 'invalid stored positions');

export type StoredTraining = z.infer<typeof storedTrainingSchema>;

export function storedTraining(session: StoredTraining['session'], startedAtMillis: number): StoredTraining {
  return storedTrainingSchema.parse({ session, startedAtMillis,
    answers: Object.fromEntries(session.items.flatMap((item) => item.answer ? [[String(item.position), item.answer]] : [])),
    unsent: [], position: 0, finishSent: Boolean(session.finishedAt),
    ...(session.finishedAt && { finish: { finishedAt: session.finishedAt, timedOut: false } }),
  });
}
