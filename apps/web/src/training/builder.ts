import type { Difficulty, QuestionType, TrainingMode, TrainingOptions, TrainingRequest } from '@greprep/api-client';

export const TYPE_LABELS: Record<QuestionType, string> = {
  text_completion: 'Text Completion', sentence_equivalence: 'Sentence Equivalence',
  quantitative_comparison: 'Quantitative Comparison', multiple_choice: 'Multiple Choice',
};
export interface BuilderForm {
  section: 'verbal' | 'quant'; type: QuestionType; countText: string; mode: TrainingMode;
  topicIds: string[] | undefined; difficulty: Difficulty | undefined;
}
export interface BuilderState { options: TrainingOptions; form: BuilderForm; preset: number | undefined }
export function presetsOf(options: TrainingOptions) { return options.presets.filter((p) => p.kind === 'last' || p.kind === 'timed'); }
export function defaultForm(options: TrainingOptions, section: BuilderForm['section'], type?: QuestionType): BuilderForm {
  const types = options.types.filter((t) => t.section === section);
  const chosen = types.find((t) => t.questionType === type) ?? types.find((t) => t.topics.length > 0) ?? types[0];
  return { section, type: chosen?.questionType ?? (section === 'quant' ? 'quantitative_comparison' : 'text_completion'),
    countText: '10', mode: 'practice', topicIds: undefined, difficulty: undefined };
}
export function formOf(request: TrainingRequest, options: TrainingOptions): BuilderForm {
  return { ...defaultForm(options, request.section === 'quant' ? 'quant' : 'verbal', request.questionTypes[0]),
    countText: String(request.count), mode: request.mode, topicIds: request.topicIds?.length ? request.topicIds : undefined, difficulty: request.difficulty };
}
export function initialBuilder(options: TrainingOptions, section?: BuilderForm['section'], type?: QuestionType): BuilderState {
  const preset = section ? -1 : presetsOf(options).findIndex((p) => p.kind === 'last');
  const last = presetsOf(options)[preset];
  return { options, form: last ? formOf(last.request, options) : defaultForm(options, section ?? 'verbal', type), preset: preset < 0 ? undefined : preset };
}
export function topicsOf({ options, form }: BuilderState) { return options.types.find((t) => t.questionType === form.type)?.topics ?? []; }
export function available(state: BuilderState): number {
  const { form } = state;
  return topicsOf(state).filter((t) => form.topicIds === undefined || form.topicIds.includes(t.id))
    .reduce((sum, t) => sum + (form.difficulty ? t.available[form.difficulty] : t.available.easy + t.available.medium + t.available.hard), 0);
}
export function requestOf(state: BuilderState): TrainingRequest | undefined {
  if (state.preset !== undefined) return presetsOf(state.options)[state.preset]?.request;
  const { form, options } = state;
  const count = /^\d+$/.test(form.countText) ? Number(form.countText) : 0;
  const questions = Math.min(count, available(state), options.maxQuestions);
  if (questions < 1) return undefined;
  return { section: form.section, questionTypes: [form.type], count: questions, mode: form.mode,
    ...(form.topicIds && { topicIds: form.topicIds }), ...(form.difficulty && { difficulty: form.difficulty }) };
}
export function minutes(options: TrainingOptions, request: TrainingRequest): number {
  const pace = options.types.find((t) => request.questionTypes.includes(t.questionType))?.paceSeconds ?? 0;
  return Math.ceil(request.count * pace / 60);
}
export function toggleTopic(state: BuilderState, id: string): BuilderForm {
  const all = topicsOf(state).map((t) => t.id);
  const current = state.form.topicIds ?? all;
  const next = current.includes(id) ? current.filter((t) => t !== id) : [...current, id];
  return { ...state.form, topicIds: all.length === next.length && all.every((id) => next.includes(id)) ? undefined : next };
}
/** Формат тех же строк, что в Android; вход здесь — только словарь и числа интерфейса. */
export function trainingText(text: string, ...values: (string | number)[]): string {
  return text.replace(/%(\d+)\$[sd]/g, (_, index: string) => String(values[Number(index) - 1]));
}
