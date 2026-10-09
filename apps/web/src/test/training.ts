import { schemas, type GivenAnswer, type TrainingOptions, type TrainingSession } from '@greprep/api-client';
import { storedTraining } from '../training/model';

export const trainingSession = (over: Partial<TrainingSession> = {}): TrainingSession => schemas.TrainingSession.parse({
  id: '00000000-0000-4000-8000-000000000100', mode: 'practice', section: 'verbal', questionTypes: ['text_completion'],
  startedAt: '2026-10-06T09:00:00Z', items: Array.from({ length: 3 }, (_, position) => ({ position, question: {
    id: `00000000-0000-4000-8000-00000000000${position + 1}`, questionType: 'text_completion', section: 'verbal',
    topicId: 'contrast', topicTitle: { ru: 'Контраст', en: 'Contrast' }, difficulty: 'easy', prompt: 'Fixture ___.',
    groups: [{ options: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }] }], selectCount: 1, answer: ['A'],
    explanation: { solution: { ru: 'Тест', en: 'Fixture' }, options: [{ optionId: 'B', text: { ru: 'Тест', en: 'Fixture' } }] },
  } })), ...over,
});
export const givenAnswer = (over: Partial<GivenAnswer> = {}): GivenAnswer => ({ position: 0, optionIds: ['A'], dontKnow: false,
  flagged: false, answeredAt: '2026-10-06T09:01:00Z', elapsedMs: 1000, ...over });
export const savedTraining = (id = trainingSession().id, startedAtMillis = Date.now()) => storedTraining(trainingSession({ id }), startedAtMillis);
export const trainingOptions = (over: Partial<TrainingOptions> = {}): TrainingOptions => ({
  types: schemas.QuestionType.options.map((questionType, index) => ({ questionType, section: index < 2 ? 'verbal' : 'quant',
    paceSeconds: index < 2 ? 90 : 105, topics: ['contrast', 'cause'].map((id) => ({ id, title: { ru: id === 'contrast' ? 'Контраст' : 'Причина', en: id }, available: { easy: 3, medium: 2, hard: 1 } })) })),
  presets: [{ kind: 'timed', request: { section: 'verbal', questionTypes: ['text_completion', 'sentence_equivalence'], count: 12, mode: 'check' } }], maxQuestions: 50, ...over,
});

export function questionFixture(type: import('@greprep/api-client').QuestionType, blanks = 1): import('@greprep/api-client').Question {
  const verbal = type === 'text_completion' || type === 'sentence_equivalence';
  return schemas.Question.parse({ ...trainingSession().items[0]!.question,
    questionType: type, section: verbal ? 'verbal' : 'quant',
    prompt: Array.from({ length: type === 'text_completion' ? blanks : 1 }, () => 'Fixture ___').join(' and '),
    groups: Array.from({ length: blanks }, (_, index) => ({ options: ['A', 'B', 'C'].map((letter) => ({ id: blanks === 1 ? letter : `${letter}${index}`, text: `${letter} word ${index}` })) })),
    selectCount: type === 'sentence_equivalence' ? 2 : 1,
    answer: type === 'sentence_equivalence' ? ['A', 'C'] : Array.from({ length: blanks }, (_, index) => blanks === 1 ? 'A' : `A${index}`),
    ...(type === 'quantitative_comparison' && { condition: '0 < x < 1', quantityA: 'x', quantityB: 'x²' }),
    explanation: { solution: { ru: '*Слово* помогает.', en: '*Word* helps.' }, options: [{ optionId: blanks === 1 ? 'B' : 'B0', text: { ru: 'Неверный выбор.', en: 'Wrong choice.' } }] },
  });
}
