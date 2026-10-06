import { describe, expect, it } from 'vitest';
import { browserLocale, telegramLocale } from './locale';

describe('browserLocale (сайт до входа)', () => {
  it.each([
    [['en-US'], 'en'],
    [['en-GB', 'de'], 'en'],
    [['EN'], 'en'],
    // Английский первым, но русский в списке — русский: человек его знает.
    [['en-US', 'ru-RU'], 'ru'],
    [['ru-RU', 'en-US'], 'ru'],
    // Не английский первым — русский (казахский, немецкий у релокантов и т. п.).
    [['kk-KZ'], 'ru'],
    [['de-DE', 'en-US'], 'ru'],
    [[], 'ru'],
  ] as const)('%j → %s', (languages, want) => {
    expect(browserLocale(languages)).toBe(want);
  });
});

describe('telegramLocale (мини-апп до входа — как сервер)', () => {
  it.each([
    ['ru', 'ru'],
    ['RU-ru', 'ru'],
    ['be', 'ru'],
    ['kk', 'ru'],
    ['ky', 'ru'],
    ['uz', 'ru'],
    ['tg', 'ru'],
    ['en', 'en'],
    ['de', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ] as const)('%s → %s', (code, want) => {
    expect(telegramLocale(code)).toBe(want);
  });
});
