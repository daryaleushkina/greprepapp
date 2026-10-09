import type { LocalizedText, Question } from '@greprep/api-client';
import type { StoredTraining } from './model';

export interface TopicReview { topicId: string; title: LocalizedText; mistakes: number; positions: number[] }

export const TrainingRules = {
  repeatCount: (mistakes: number) => Math.min(10, Math.max(5, mistakes * 2)),
  timeLimitSeconds: (count: number, paceSeconds: number) => count * paceSeconds,
  isCorrect(question: Question, optionIds: string[]): boolean {
    return optionIds.length === question.answer.length && new Set(optionIds).size === new Set(question.answer).size &&
      question.answer.every((id) => optionIds.includes(id));
  },
  missingGroups(question: Question, optionIds: string[]): number[] {
    return question.groups.flatMap((group, index) => group.options.filter((option) => optionIds.includes(option.id)).length < question.selectCount ? [index] : []);
  },
  isComplete(question: Question, optionIds: string[]): boolean {
    return this.missingGroups(question, optionIds).length === 0;
  },
  toggle(question: Question, selection: string[], optionId: string): string[] {
    const group = question.groups.find((group) => group.options.some((option) => option.id === optionId));
    if (!group) return selection;
    const inGroup = (id: string) => group.options.some((option) => option.id === id);
    if (question.selectCount === 1) return [...selection.filter((id) => !inGroup(id)), optionId];
    if (selection.includes(optionId)) return selection.filter((id) => id !== optionId);
    const chosen = selection.filter(inGroup);
    const trimmed = chosen.length >= question.selectCount ? selection.filter((id) => id !== chosen[0]) : selection;
    return [...trimmed, optionId];
  },
  remainingSeconds(training: StoredTraining, nowMillis: number): number | undefined {
    const limit = training.session.timeLimitSeconds;
    if (training.session.mode !== 'check' || limit === undefined) return undefined;
    return Math.max(0, limit - Math.trunc((nowMillis - training.startedAtMillis) / 1000));
  },
  durationSeconds(training: StoredTraining): number {
    if (!training.finish) return 0;
    const seconds = Math.max(0, Math.trunc((Date.parse(training.finish.finishedAt) - training.startedAtMillis) / 1000));
    return training.session.mode === 'check' && training.session.timeLimitSeconds !== undefined ? Math.min(seconds, training.session.timeLimitSeconds) : seconds;
  },
  summaryMinutes(durationSeconds: number, limitSeconds?: number) {
    const limitMinutes = limitSeconds === undefined ? undefined : Math.ceil(limitSeconds / 60);
    const minutes = Math.max(1, Math.round(durationSeconds / 60));
    return { minutes: limitMinutes === undefined ? minutes : Math.min(minutes, limitMinutes), limitMinutes };
  },
  result(training: StoredTraining) {
    const timedOut = training.session.mode === 'check' && training.finish?.timedOut === true;
    let correct = 0;
    let unanswered = 0;
    const byTopic = new Map<string, TopicReview>();
    for (const item of training.session.items) {
      const answer = training.answers[String(item.position)];
      const chosen = answer?.optionIds ?? [];
      if (chosen.length > 0 && this.isCorrect(item.question, chosen)) { correct++; continue; }
      if (chosen.length === 0) { unanswered++; if (timedOut && !answer?.dontKnow) continue; }
      const q = item.question;
      const previous = byTopic.get(q.topicId);
      if (previous) { previous.mistakes++; previous.positions.push(item.position); }
      else byTopic.set(q.topicId, { topicId: q.topicId, title: q.topicTitle, mistakes: 1, positions: [item.position] });
    }
    // Равные темы остаются в порядке вопросов, как в Android и общем договоре.
    const review = [...byTopic.values()].sort((a, b) => b.mistakes - a.mistakes).slice(0, 3);
    return { correct, total: training.session.items.length, unanswered, durationSeconds: this.durationSeconds(training), review };
  },
};
