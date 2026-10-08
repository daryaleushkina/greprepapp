import { describe, expect, test } from 'vitest';
import { trainingOptions } from '../test/training';
import { available, defaultForm, formOf, initialBuilder, minutes, presetsOf, requestOf, toggleTopic, trainingText } from './builder';

const options = trainingOptions();
describe('конструктор — поведение Android', () => {
  test('умолчание, прошлый набор и вход из шага', () => {
    expect(initialBuilder(options).form).toMatchObject({ section: 'verbal', type: 'text_completion', countText: '10', mode: 'practice' });
    const request = { section: 'quant', questionTypes: ['multiple_choice'], count: 7, mode: 'check', topicIds: ['cause'], difficulty: 'hard' } as const;
    const withLast = trainingOptions({ presets: [{ kind: 'last', request: { ...request, questionTypes: [...request.questionTypes], topicIds: [...request.topicIds] } }, { kind: 'unknown', request: options.presets[0]!.request }] });
    expect(presetsOf(withLast)).toHaveLength(1);
    expect(initialBuilder(withLast)).toMatchObject({ preset: 0, form: { type: 'multiple_choice', countText: '7', topicIds: ['cause'], difficulty: 'hard' } });
    expect(initialBuilder(withLast, 'verbal', 'sentence_equivalence')).toMatchObject({ preset: undefined, form: { type: 'sentence_equivalence' } });
    expect(requestOf(initialBuilder(withLast))).toEqual(withLast.presets[0]?.request);
  });
  test('пустые типы и тип, которого сервер не прислал', () => {
    expect(defaultForm(trainingOptions({ types: [] }), 'quant').type).toBe('quantitative_comparison');
    expect(defaultForm(trainingOptions({ types: [] }), 'verbal').type).toBe('text_completion');
    const empty = trainingOptions({ types: options.types.map((t) => ({ ...t, topics: [] })) });
    expect(defaultForm(empty, 'verbal').type).toBe('text_completion');
    expect(available(initialBuilder(empty))).toBe(0); expect(requestOf(initialBuilder(empty))).toBeUndefined();
  });
  test('все темы, выбранные темы и каждая сложность; число ограничено доступным', () => {
    const state = initialBuilder(options);
    expect(available(state)).toBe(12); expect(requestOf(state)?.count).toBe(10);
    for (const [difficulty, count] of [['easy', 6], ['medium', 4], ['hard', 2]] as const) {
      expect(available({ ...state, form: { ...state.form, difficulty } })).toBe(count);
    }
    const form = { ...state.form, countText: '99', topicIds: ['cause'], difficulty: 'easy' as const, mode: 'check' as const };
    expect(requestOf({ ...state, form })).toMatchObject({ count: 3, topicIds: ['cause'], difficulty: 'easy', mode: 'check' });
    expect(requestOf({ ...state, options: { ...options, maxQuestions: 2 }, form })?.count).toBe(2);
    for (const countText of ['', '0', '-1', 'abc']) expect(requestOf({ ...state, form: { ...state.form, countText } })).toBeUndefined();
    expect(requestOf({ ...state, preset: 99 })).toBeUndefined();
  });
  test('снять все темы — пусто; вернуть все — снова все', () => {
    const state = initialBuilder(options); const one = { ...state, form: toggleTopic(state, 'contrast') };
    expect(one.form.topicIds).toEqual(['cause']);
    const none = { ...one, form: toggleTopic(one, 'cause') }; expect(none.form.topicIds).toEqual([]); expect(requestOf(none)).toBeUndefined();
    const oneAgain = { ...none, form: toggleTopic(none, 'contrast') };
    expect(toggleTopic(oneAgain, 'cause').topicIds).toBeUndefined();
  });
  test('восстановление набора без фильтров и минуты', () => {
    const request = { section: 'verbal', questionTypes: ['text_completion'], count: 3, mode: 'practice' } as const;
    expect(formOf({ ...request, questionTypes: [...request.questionTypes], topicIds: [] }, options).topicIds).toBeUndefined();
    expect(minutes(options, { ...request, questionTypes: [...request.questionTypes] })).toBe(5);
    expect(minutes({ ...options, types: [] }, { ...request, questionTypes: [...request.questionTypes] })).toBe(0);
    expect(trainingText('%1$s · %2$d', 'Контраст', 3)).toBe('Контраст · 3');
  });
});
