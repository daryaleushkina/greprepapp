// Контраст WCAG 2.2 AA для пар «текст / фон», которые реально встречаются на экранах «Шагов», в обеих темах.
// Полупрозрачные цвета сначала накладываются на то, что под ними (как их видит человек).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveModes } from '../build.mjs';

const modes = await resolveModes();

// Свечение — радиальный градиент от strong (центр над экраном) к soft. Первая строка текста (y≈72–110 px)
// лежит примерно на 3/4 пути к soft; проверять по полному strong — строже, чем видит человек.
function glowUnderTitle(mode) {
  const s = color(mode, 'color.glow.verbal.strong');
  const w = color(mode, 'color.glow.verbal.soft');
  return { ...s, alpha: s.alpha * 0.25 + w.alpha * 0.75 };
}

function color(mode, path) {
  if (path === 'glow-under-title') return glowUnderTitle(mode);
  const t = modes[mode].find((x) => x.path.join('.') === path);
  if (!t) throw new Error(`нет токена ${path}`);
  return t.$value;
}
// Наложение c поверх под-слоёв (снизу вверх), результат — непрозрачный sRGB 0–1.
function flatten(layers) {
  let [r, g, b] = layers[0].components;
  for (const c of layers.slice(1)) {
    const a = c.alpha ?? 1;
    [r, g, b] = c.components.map((x, i) => x * a + [r, g, b][i] * (1 - a));
  }
  return [r, g, b];
}
const lin = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const SECTIONS = ['verbal', 'quant', 'words', 'essay', 'wrong'];
// [текст, [фон снизу вверх], минимум, где встречается]
const PAIRS = [
  ['color.text', ['color.bg'], 4.5, 'текст на фоне'],
  ['color.text', ['color.surface'], 4.5, 'текст на карточке'],
  ['color.text-secondary', ['color.bg'], 4.5, 'подписи на фоне'],
  ['color.text-secondary', ['color.surface'], 4.5, 'подписи на карточке'],
  ['color.text-secondary', ['color.bg', 'glow-under-title'], 4.5, 'подзаголовок под свечением'],
  ['color.text', ['color.bg', 'glow-under-title'], 4.5, 'заголовок под свечением'],
  ['color.on-accent', ['color.accent'], 4.5, 'главная кнопка'],
  ['color.text', ['color.surface', 'color.fill'], 4.5, 'сегмент / наведение'],
  ['color.text', ['color.bg', 'color.tab-selected'], 4.5, 'выбранная вкладка'],
  ...SECTIONS.flatMap((s) => [
    [`color.${s}`, ['color.surface'], 4.5, `${s} текстом на карточке`],
    [`color.${s}`, ['color.bg'], 4.5, `${s} текстом на фоне`],
    [`color.${s}`, ['color.surface', `color.${s}-tint`], 4.5, `${s} на своей подложке (чип)`],
  ]),
  ...['verbal', 'quant', 'words', 'essay'].map((s) => ['color.surface', [`color.${s}`], 4.5, `цифра в узле ${s} / кнопка раздела`]),
  ['color.focus', ['color.bg'], 3, 'кольцо фокуса (не текст: 3:1)'],
  ['color.focus', ['color.surface'], 3, 'кольцо фокуса на карточке'],
  ['sign-in.apple.text', ['sign-in.apple.bg'], 4.5, 'кнопка Apple'],
  ['sign-in.google.text', ['sign-in.google.bg'], 4.5, 'кнопка Google'],
  // Кнопка Telegram — официальная, цвета не наши (решение Даши 05.10.2026). Белый на #119AF5 даёт ~3,2:1:
  // меньше AA для обычного текста. Порог здесь 3 — чтобы тест ловил порчу, а не спорил с правилами Telegram.
  ['sign-in.telegram.text', ['sign-in.telegram.bg'], 3, 'кнопка Telegram (официальная, исключение)'],
];

for (const mode of ['light', 'dark']) {
  for (const [fg, bg, min, where] of PAIRS) {
    test(`${mode}: ${where} — ${fg} на ${bg.join(' + ')} ≥ ${min}`, () => {
      const r = ratio(flatten([...bg.map((p) => color(mode, p)), color(mode, fg)]).slice(0, 3), flatten(bg.map((p) => color(mode, p))));
      assert.ok(r >= min, `${r.toFixed(2)}:1 < ${min}:1`);
    });
  }
}
