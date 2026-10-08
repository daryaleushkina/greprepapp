import { describe, expect, it } from 'vitest';
import { dictionaries, type Dict } from './dict';

const ru = dictionaries.ru.today;
const en = dictionaries.en.today;

it('количество вопросов остаётся неразрывной группой', () => {
  expect(dictionaries.ru.training.questionsCount(10)).toBe('10\u00a0вопросов');
  expect(dictionaries.en.training.questionsCount(10)).toBe('10\u00a0questions');
});

it('тексты тренировки с параметрами — функции; количество и позиция не разрываются', () => {
  for (const locale of ['ru', 'en'] as const) {
    const t = dictionaries[locale].training;
    expect(typeof t.builder_start).toBe('function');
    expect(t.questionsCount(10)).toBe(locale === 'ru' ? '10\u00a0вопросов' : '10\u00a0questions');
    if (typeof t.builder_start === 'function' && typeof t.training_continue_subtitle === 'function') {
      expect(t.builder_start(t.questionsCount(10), 15)).toContain('~15\u00a0');
      expect(t.training_continue_subtitle('Verbal · Text Completion', 1, 10)).toContain(locale === 'ru' ? 'вопрос\u00a01\u00a0из\u00a010' : 'question\u00a01\u00a0of\u00a010');
    }
  }
});

describe('русские формы', () => {
  it.each([
    [1, 'около 1 минуты', '1 минута'],
    [2, 'около 2 минут', '2 минуты'],
    [5, 'около 5 минут', '5 минут'],
    [11, 'около 11 минут', '11 минут'],
    [21, 'около 21 минуты', '21 минута'],
    [22, 'около 22 минут', '22 минуты'],
    [25, 'около 25 минут', '25 минут'],
    [1.5, 'около 1.5 минуты', '1.5 минуты'],
  ])('%d', (n, about, plain) => {
    expect(ru.aboutMinutes(n)).toBe(about);
    expect(ru.minutes(n)).toBe(plain);
  });

  it('шаги — словом до восьми, дальше числом', () => {
    expect(ru.steps(1)).toBe('Один шаг');
    expect(ru.steps(3)).toBe('Три шага');
    expect(ru.steps(8)).toBe('Восемь шагов');
    expect(ru.steps(9)).toBe('9 шагов');
    expect(ru.steps(22)).toBe('22 шага');
    expect(ru.steps(21)).toBe('21 шаг');
    expect(ru.steps(1.5)).toBe('1.5 шага');
  });
});

describe('английские формы', () => {
  it('минуты и шаги', () => {
    expect(en.aboutMinutes(1)).toBe('about 1 minute');
    expect(en.aboutMinutes(25)).toBe('about 25 minutes');
    expect(en.minutes(1)).toBe('1 minute');
    expect(en.minutes(2)).toBe('2 minutes');
    expect(en.steps(3)).toBe('Three steps');
    expect(en.steps(9)).toBe('9 steps');
  });
});

describe('словари совпадают по составу', () => {
  // Пропущенный ключ в одном языке TypeScript поймал бы, но лишний — нет: проверяем, что ключи одинаковые.
  const keys = (o: object, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
  it('ru и en', () => {
    expect(keys(dictionaries.en)).toEqual(keys(dictionaries.ru));
  });

  it('в русских строках кавычки — только «ёлочки»', () => {
    const strings = (o: object): string[] =>
      Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? strings(v) : []));
    for (const s of strings(dictionaries.ru)) expect(s).not.toMatch(/[„“”"]/u);
  });
});

describe('все строки-функции отвечают текстом на обоих языках', () => {
  const functionNames = (o: object, prefix = ''): string[] => Object.entries(o).flatMap(([key, value]) =>
    typeof value === 'function' ? [`${prefix}${key}`] : value && typeof value === 'object' ? functionNames(value, `${prefix}${key}.`) : []);
  // Аргументы проверяет TypeScript: у текстов тренировки теперь разные подписи, вызова всех с одним числом недостаточно.
  const samples = (t: Dict): Record<string, string> => ({
    'training.review_all': t.training.review_all(3),
    'training.review_mistakes': t.training.review_mistakes(2),
    'training.review_question': t.training.review_question(1),
    'training.report_limit': t.training.report_limit(1800, 2000),
    'training.report_context': t.training.report_context(1, 'Text Completion'),
    'training.question_next': t.training.question_next(2, 3),
    'training.question_of': t.training.question_of(1, 3),
    'training.question_progress_description': t.training.question_progress_description(1, 3),
    'training.question_missing_blank': t.training.question_missing_blank('(i)'),
    'training.question_missing_blanks': t.training.question_missing_blanks('(i), (ii)'),
    'training.timer_description': t.training.timer_description(1, 30, 1, 3),
    'training.overview_summary': t.training.overview_summary(1, 3, 1),
    'training.overview_back': t.training.overview_back(1),
    'training.overview_item': t.training.overview_item(1, 'X'),
    'training.summary_correct_of': t.training.summary_correct_of(1, 3),
    'training.summary_of_limit': t.training.summary_of_limit('1 min', 3),
    'training.summary_question': t.training.summary_question('1'),
    'training.summary_questions': t.training.summary_questions('1, 2'),
    'training.summary_repeat': t.training.summary_repeat('5'),
    'training.summary_ran_out': t.training.summary_ran_out('2'),
    'training.summary_mistakes': t.training.summary_mistakes(2),
    'training.verdict_answer': t.training.verdict_answer('A'),
    'training.verdict_answers': t.training.verdict_answers('A, B'),
    'training.why_not': t.training.why_not('A'),
    'training.training_continue_subtitle': t.training.training_continue_subtitle('Verbal', 1, 10),
    'training.builder_preset_timed_subtitle': t.training.builder_preset_timed_subtitle('Verbal', t.training.questionsCount(12), 18),
    'training.builder_topics_some': t.training.builder_topics_some(1, 3),
    'training.builder_start': t.training.builder_start(t.training.questionsCount(3), 5),
    'training.topics_done': t.training.topics_done(t.training.questionsCount(3)),
    'training.questionsCount': t.training.questionsCount(3),
    'today.steps': t.today.steps(3),
    'today.aboutMinutes': t.today.aboutMinutes(3),
    'today.minutes': t.today.minutes(3),
    'today.approxShort': t.today.approxShort(3),
    'today.short': t.today.short(3),
    'today.now': t.today.now('X'),
    'settings.version': t.settings.version('X'),
  });
  for (const locale of ['ru', 'en'] as const) it(locale, () => {
    const out = samples(dictionaries[locale]);
    expect(Object.keys(out).sort()).toEqual(functionNames(dictionaries[locale]).sort());
    for (const [name, text] of Object.entries(out)) expect(text, name).not.toMatch(/undefined|NaN|#|^\s*$/);
  });
});
