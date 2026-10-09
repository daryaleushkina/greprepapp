import { describe, expect, test } from 'vitest';
import { trainingOptions } from '../test/training';
import { available, defaultForm, formOf, initialBuilder, minutes, presetsOf, requestOf, toggleTopic, updateOptions } from './builder';

const options = trainingOptions();
describe('конструктор — поведение Android', () => {
  test('обновление каталога сохраняет поля; исчезнувший тип и выбранные темы убираются', () => {
    const state = initialBuilder(options);
    state.form = { ...state.form, countText: '7', mode: 'check', difficulty: 'hard', topicIds: ['cause'] };
    expect(updateOptions(state, options)).toBe(state);
    const removedTopic = trainingOptions({ types: options.types.map((type) => ({ ...type, topics: type.topics.filter((topic) => topic.id !== 'cause') })) });
    expect(updateOptions(state, removedTopic).form).toMatchObject({ countText: '7', mode: 'check', difficulty: 'hard', topicIds: [] });
    const removedType = trainingOptions({ types: options.types.filter((type) => type.questionType !== 'text_completion') });
    expect(updateOptions(state, removedType).form).toMatchObject({ type: 'sentence_equivalence', countText: '7', mode: 'check', difficulty: 'hard', topicIds: undefined });
    expect(requestOf(updateOptions(state, trainingOptions({ types: [] })))).toBeUndefined();
  });
  test('набор сохраняется при перестановке, но пропавший фильтр или тип больше не запускается', () => {
    const last = { kind: 'last', request: { exam: 'gre', section: 'verbal', questionTypes: ['text_completion'], count: 3, mode: 'practice', topicIds: ['cause'] } } as const;
    const before = trainingOptions({ presets: [{ ...last, request: { ...last.request, questionTypes: [...last.request.questionTypes], topicIds: [...last.request.topicIds] } }] });
    const state = initialBuilder(before);
    const reordered = trainingOptions({ presets: [options.presets[0]!, before.presets[0]!] });
    expect(updateOptions(state, reordered).preset).toBe(1);
    const removedTopic = trainingOptions({ presets: before.presets, types: options.types.map((type) => ({ ...type, topics: [] })) });
    expect(updateOptions(state, removedTopic).preset).toBeUndefined();
    expect(updateOptions(state, trainingOptions({ presets: [] })).form.countText).toBe('3');
    const mixed = { ...initialBuilder(options), preset: 0, form: formOf(options.presets[0]!.request, options) };
    const removedType = trainingOptions({ types: options.types.filter((type) => type.questionType !== 'sentence_equivalence') });
    expect(updateOptions(mixed, removedType).preset).toBeUndefined();
  });
  test('исчезнувшая тема не уходит в запрос тренировки', () => {
    const state = initialBuilder(options);
    state.form.topicIds = ['cause', 'deleted'];
    expect(requestOf(state)?.topicIds).toEqual(['cause']);
  });
  test('умолчание, прошлый набор и вход из шага', () => {
    expect(initialBuilder(options).form).toMatchObject({ section: 'verbal', type: 'text_completion', countText: '10', mode: 'practice' });
    const request = { exam: 'gre', section: 'quant', questionTypes: ['multiple_choice'], count: 7, mode: 'check', topicIds: ['cause'], difficulty: 'hard' } as const;
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
    const request = { exam: 'gre', section: 'verbal', questionTypes: ['text_completion'], count: 3, mode: 'practice' } as const;
    expect(formOf({ ...request, questionTypes: [...request.questionTypes], topicIds: [] }, options).topicIds).toBeUndefined();
    expect(minutes(options, { ...request, questionTypes: [...request.questionTypes] })).toBe(5);
    expect(minutes({ ...options, types: [] }, { ...request, questionTypes: [...request.questionTypes] })).toBe(0);
  });
});
