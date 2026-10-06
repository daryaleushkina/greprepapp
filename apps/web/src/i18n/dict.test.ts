import { describe, expect, it } from 'vitest';
import { dictionaries } from './dict';

const ru = dictionaries.ru.today;
const en = dictionaries.en.today;

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
