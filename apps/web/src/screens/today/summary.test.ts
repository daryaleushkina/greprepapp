import type { TodayStep } from '@greprep/api-client';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '../../i18n/dict';
import { sectionLang, todaySummary } from './summary';

const step = (state: TodayStep['state'], minutes: number, section: TodayStep['section'] = 'verbal'): TodayStep => ({
  id: `${state}-${minutes}`,
  section,
  title: 't',
  minutes,
  state,
});

describe('todaySummary', () => {
  const t = dictionaries.ru.today;
  it('план в процессе — «около»', () => {
    expect(todaySummary([step('done', 5), step('current', 10), step('next', 10)], t)).toBe('Три шага · около 25 минут');
  });
  it('всё пройдено — точное время', () => {
    expect(todaySummary([step('done', 12), step('done', 9), step('done', 4)], t)).toBe('Три шага · 25 минут');
  });
  it('пустой план', () => {
    expect(todaySummary([], t)).toBe('На сегодня шагов нет');
  });
  it('по-английски', () => {
    expect(todaySummary([step('current', 1)], dictionaries.en.today)).toBe('One step · about 1 minute');
  });
});

describe('sectionLang', () => {
  it('термины GRE — английские', () => {
    expect(sectionLang('verbal')).toBe('en');
    expect(sectionLang('quant')).toBe('en');
    expect(sectionLang('words')).toBeUndefined();
    expect(sectionLang('essay')).toBeUndefined();
  });
});

it.each(['reading', 'listening', 'writing', 'speaking'] as const)('раздел TOEFL %s читается английским голосом', (section) => {
  expect(sectionLang(section)).toBe('en');
});
