import type { TodayStep } from '@greprep/api-client';
import type { Dict } from '../../i18n/dict';

/**
 * Строка под заголовком «Сегодня»: «Три шага · около 25 минут»; когда всё пройдено — «Три шага · 25 минут»
 * (без «около»: время уже известно). Так же считает приложение Apple (TodaySummary.swift).
 */
export function todaySummary(steps: readonly TodayStep[], t: Dict['today']): string {
  if (steps.length === 0) return t.noSteps;
  const minutes = steps.reduce((sum, s) => sum + s.minutes, 0);
  const done = steps.every((s) => s.state === 'done');
  return `${t.steps(steps.length)} · ${done ? t.minutes(minutes) : t.aboutMinutes(minutes)}`;
}

/** Названия разделов GRE и TOEFL остаются английскими и в русском интерфейсе. */
export function sectionLang(section: TodayStep['section']): 'en' | undefined {
  return section !== 'words' && section !== 'essay' ? 'en' : undefined;
}
