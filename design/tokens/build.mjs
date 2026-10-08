// Сборка токенов «Шагов»: src/*.json (формат W3C DTCG) → веб, Apple, Android и шапка DESIGN.md.
//
//   pnpm build   — пересобрать generated/ и шапку DESIGN.md
//   pnpm check   — то же в памяти; если файлы в git разошлись с источником — выход 1 (для CI)
//
// Style Dictionary разбирает DTCG, ссылки {palette.…} и наследование $type; файлы для платформ пишем
// своими форматами: встроенные выдают одну тему на файл, а нам нужны светлая и тёмная вместе —
// в CSS через data-theme, у Apple в каталоге цветов с вариантами внешнего вида, в Compose двумя наборами.
// Сгенерированное лежит в git: Xcode и Gradle не должны зависеть от Node (решение Даши 05.10.2026).
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import StyleDictionary from 'style-dictionary';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const out = join(here, 'generated');
const MODES = ['light', 'dark'];
const WIDE = '-wide';
const HEADER = 'Сгенерировано design/tokens/build.mjs из design/tokens/src — руками не править.';

// ---------- Чтение ----------

export async function resolveModes() {
  const modes = {};
  for (const mode of MODES) {
    const sd = new StyleDictionary({
      source: [
        join(here, 'src/primitives/*.json'),
        join(here, 'src/semantic/typography.json'),
        join(here, `src/semantic/color.${mode}.json`),
        join(here, `src/third-party/sign-in.${mode}.json`),
      ],
      log: { verbosity: 'silent', warnings: 'error', errors: { brokenReferences: 'throw' } },
      platforms: { raw: {} },
    });
    const { allTokens } = await sd.getPlatformTokens('raw');
    // Палитра — только сырьё для смысловых токенов, наружу не выходит.
    modes[mode] = allTokens.filter((t) => t.path[0] !== 'palette');
  }
  return modes;
}

const THEMED = new Set(['color', 'gradient', 'shadow']);
const isThemed = (t) => THEMED.has(t.$type);

// Нетематические токены обязаны совпадать в обеих темах, иначе тема протекла не туда.
function split(modes) {
  const [light, dark] = MODES.map((m) => modes[m]);
  const key = (t) => t.path.join('.');
  const darkByKey = new Map(dark.map((t) => [key(t), t]));
  for (const t of light) {
    const d = darkByKey.get(key(t));
    if (!d) throw new Error(`токен ${key(t)} есть в светлой теме, но нет в тёмной`);
    if (!isThemed(t) && JSON.stringify(t.$value) !== JSON.stringify(d.$value)) {
      throw new Error(`нетематический токен ${key(t)} разный в темах`);
    }
  }
  if (dark.length !== light.length) throw new Error('в тёмной теме есть токены, которых нет в светлой');
  return {
    common: light.filter((t) => !isThemed(t)),
    themed: Object.fromEntries(MODES.map((m) => [m, modes[m].filter(isThemed)])),
  };
}

// ---------- Значения ----------

const rgb255 = (c) => c.components.map((x) => Math.round(x * 255));
const alphaOf = (c) => c.alpha ?? 1;
const fmt = (n) => String(Number(n.toFixed(4)));

export function cssColor(c) {
  if (alphaOf(c) === 1) return (c.hex ?? '#' + rgb255(c).map((x) => x.toString(16).padStart(2, '0')).join('')).toUpperCase();
  return `rgb(${rgb255(c).join(' ')} / ${fmt(alphaOf(c))})`;
}
const px = (d) => `${fmt(d.value)}${d.unit}`;
const rem = (d) => `${fmt(d.value / 16)}rem`;
const shadow = (s) => `${s.inset ? 'inset ' : ''}${px(s.offsetX)} ${px(s.offsetY)} ${px(s.blur)} ${px(s.spread)} ${cssColor(s.color)}`;
const gradient = (stops) => `linear-gradient(180deg, ${stops.map((s) => `${cssColor(s.color)} ${fmt(s.position * 100)}%`).join(', ')})`;
const family = (f) => f.map((x) => (/\s/.test(x) ? `'${x}'` : x)).join(', ');

function cssValue(t) {
  const v = t.$value;
  switch (t.$type) {
    case 'color': return cssColor(v);
    case 'gradient': return gradient(v);
    case 'shadow': return shadow(v);
    case 'dimension': return px(v);
    case 'duration': return `${v.value}${v.unit}`;
    case 'cubicBezier': return `cubic-bezier(${v.join(', ')})`;
    case 'fontFamily': return family(v);
    case 'fontWeight': case 'number': return fmt(v);
    default: throw new Error(`нет вывода CSS для типа ${t.$type} (${t.path.join('.')})`);
  }
}

const typeTokens = (common) => common.filter((t) => t.$type === 'typography');
const roleName = (t) => t.path.at(-1);
const baseRoles = (common) => typeTokens(common).filter((t) => !roleName(t).endsWith(WIDE));
const wideOf = (common, role) => typeTokens(common).find((t) => roleName(t) === role + WIDE);
const lineHeightPx = (v) => Math.round(v.fontSize.value * v.lineHeight);
const trackingEm = (v) => (v.letterSpacing.unit === 'em' ? v.letterSpacing.value : v.letterSpacing.value / v.fontSize.value);

// ---------- Веб ----------

function emitCss({ common, themed }) {
  const name = (t) => '--' + t.path.join('-');
  const block = (sel, tokens, extra = []) =>
    `${sel} {\n${[...extra, ...tokens.map((t) => `  ${name(t)}: ${cssValue(t)};`)].join('\n')}\n}\n`;
  // Размер текста — в rem: «Крупнее» и настройка шрифта браузера масштабируют весь текст разом.
  const font = (v) => `${v.fontWeight} ${rem(v.fontSize)}/${fmt(v.lineHeight)} var(--font-family-text)`;
  const typeVars = (t, role = roleName(t)) => [
    `  --font-${role}: ${font(t.$value)};`,
    `  --tracking-${role}: ${fmt(trackingEm(t.$value))}em;`,
  ];
  const plain = common.filter((t) => t.$type !== 'typography');
  const large = common.find((t) => t.path.join('.') === 'font.text-scale-large').$value;
  const wide = common.find((t) => t.path.join('.') === 'layout.breakpoint-wide').$value;
  const wides = baseRoles(common).filter((t) => wideOf(common, roleName(t)));
  return [
    `/* ${HEADER}\n * Тема: data-theme="light" | "dark" на <html>; без атрибута — как в системе (до запуска JS).\n * Размер текста: data-text-size="large" на <html>. Роли текста: font: var(--font-body); letter-spacing: var(--tracking-body). */\n`,
    block(':root', [...plain, ...themed.light], ['  color-scheme: light;', ...baseRoles(common).flatMap((t) => typeVars(t))]),
    block(':root[data-theme="dark"]', themed.dark, ['  color-scheme: dark;']),
    `@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme="light"])', themed.dark, ['  color-scheme: dark;']).replace(/^/gm, '  ').trimEnd()}\n}\n`,
    `:root[data-text-size="large"] {\n  font-size: ${fmt(large * 100)}%;\n}\n`,
    `@media (min-width: ${px(wide)}) {\n  :root {\n${wides.flatMap((t) => typeVars(wideOf(common, roleName(t)), roleName(t))).map((l) => '  ' + l).join('\n')}\n  }\n}\n`,
  ].join('\n');
}

// ---------- Apple ----------

const camel = (parts) => parts.join('-').split('-').map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p)).join('');
const swiftName = (parts) => { const n = camel(parts); return /^\d/.test(n) ? 's' + n : n; };

// Каталог цветов: у каждого цвета два внешних вида, систему переключает сама ОС.
// Компонент — всегда с десятичной точкой: число без неё Xcode читает как целое 0–255, и «1» становится 1/255
// (непрозрачный цвет почти исчезает). Тест — test/xcassets.test.mjs.
function emitColorAssets({ themed }) {
  const files = { 'GPColors.xcassets/Contents.json': { info: { author: 'xcode', version: 1 } } };
  const unit = (n) => n.toFixed(4);
  const comp = (c) => {
    const [r, g, b] = c.components;
    return { 'color-space': 'srgb', components: { red: unit(r), green: unit(g), blue: unit(b), alpha: unit(alphaOf(c)) } };
  };
  const dark = new Map(themed.dark.map((t) => [t.path.join('.'), t]));
  for (const t of themed.light.filter((t) => t.$type === 'color')) {
    const n = camel(t.path.slice(t.path[0] === 'color' ? 1 : 0));
    files[`GPColors.xcassets/${n}.colorset/Contents.json`] = {
      colors: [
        { color: comp(t.$value), idiom: 'universal' },
        { appearances: [{ appearance: 'luminosity', value: 'dark' }], color: comp(dark.get(t.path.join('.')).$value), idiom: 'universal' },
      ],
      info: { author: 'xcode', version: 1 },
    };
  }
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, JSON.stringify(v, null, 2) + '\n']));
}

// Роль текста → стиль Dynamic Type, с которым она растёт (Font.custom(_:size:relativeTo:)).
const RELATIVE = {
  display: 'largeTitle', score: 'largeTitle', headword: 'largeTitle', 'title-1': 'largeTitle', 'title-2': 'title',
  'title-3': 'title3', timer: 'title3', prompt: 'body', headline: 'headline', body: 'body', 'body-long': 'body',
  callout: 'callout', subhead: 'subheadline', footnote: 'footnote', caption: 'caption', key: 'caption2', 'tab-label': 'caption2',
};
const SWIFT_WEIGHT = { 400: '.regular', 500: '.medium', 600: '.semibold' };

function emitSwift({ common }, apple) {
  const group = (head) => common.filter((t) => t.path[0] === head && t.$type === 'dimension');
  const cg = (title, head, doc) => [
    `/// ${doc}`,
    `public enum ${title} {`,
    ...group(head).map((t) => `${t.$description ? `    /// ${t.$description}\n` : ''}    public static let ${swiftName(t.path.slice(1))}: CGFloat = ${fmt(t.$value.value)}`),
    '}',
  ].join('\n');
  const get = (p) => common.find((t) => t.path.join('.') === p).$value;
  const style = (t, role) => {
    const v = t.$value;
    const rel = RELATIVE[role];
    if (!rel) throw new Error(`для роли ${role} не задан стиль Dynamic Type`);
    if (!SWIFT_WEIGHT[v.fontWeight]) throw new Error(`нет веса ${v.fontWeight} для Swift`);
    return `GPTextStyle(size: ${fmt(v.fontSize.value)}, lineHeight: ${lineHeightPx(v)}, weight: ${SWIFT_WEIGHT[v.fontWeight]}, tracking: ${fmt(trackingEm(v))}, relativeTo: .${rel})`;
  };
  const roles = typeTokens(common).map((t) => {
    const n = roleName(t);
    const base = n.endsWith(WIDE) ? n.slice(0, -WIDE.length) : n;
    return `${t.$description ? `    /// ${t.$description}\n` : ''}    public static let ${swiftName([n])} = ${style(t, base)}`;
  });
  const ease = get('motion.easing.out');
  return `// ${HEADER}
// Цвета — в каталоге GPColors.xcassets (Color(.text), Color(.textSecondary)…): светлую и тёмную тему
// переключает система. Стекло и тени не генерируются: на Apple они системные (PRODUCT.md, «Platform»).
import SwiftUI

${cg('GPSpace', 'space', 'Отступы и промежутки, pt.')}

${cg('GPRadius', 'radius', 'Радиусы скругления, pt. full — капсула: используйте Capsule().')}

${cg('GPSize', 'size', 'Размеры элементов, pt.')}

${cg('GPLayout', 'layout', 'Раскладка, pt. breakpointWide — граница компактной и широкой раскладки.')}

/// Прозрачность состояний элементов Apple.
public enum GPOpacity {
    public static let disabled: Double = ${fmt(apple.opacity.disabled.$value)}
}

/// Роль текста: размер и межстрочный — pt, трекинг — доля размера (em), relativeTo — с каким стилем Dynamic Type растёт.
public struct GPTextStyle: Sendable {
    public let size: CGFloat
    public let lineHeight: CGFloat
    public let weight: Font.Weight
    public let tracking: CGFloat
    public let relativeTo: Font.TextStyle
}

/// Роли текста. Шрифт — Onest, вшитый в приложение. Wide — та же роль в широкой раскладке (iPad, Mac).
public enum GPType {
    public static let fontFamily = "${get('font.family.text')[0]}"
    /// Настройка «Крупнее»: множитель размера поверх Dynamic Type.
    public static let textScaleLarge: CGFloat = ${fmt(get('font.text-scale-large'))}
${roles.join('\n')}
}

/// Движение. Длительности — секунды; при «Уменьшить движение» анимации нажатия и появления выключаются.
public enum GPMotion {
    public static let press: Double = ${fmt(get('motion.duration.press').value / 1000)}
    public static let reveal: Double = ${fmt(get('motion.duration.reveal').value / 1000)}
    public static let pulse: Double = ${fmt(get('motion.duration.pulse').value / 1000)}
    public static let pressScale: CGFloat = ${fmt(get('motion.press-scale'))}
    public static func easeOut(duration: Double) -> Animation {
        .timingCurve(${ease.map(fmt).join(', ')}, duration: duration)
    }
}
`;
}

// ---------- Android ----------

const KOTLIN_PACKAGE = 'greprep.design'; // поменяется вместе с именем бренда и id приложения
const kName = (parts) => { const n = camel(parts); return /^\d/.test(n) ? 's' + n : n; };
const kColor = (c) => {
  const [r, g, b] = rgb255(c);
  const a = Math.round(alphaOf(c) * 255);
  return `Color(0x${[a, r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()})`;
};

function emitKotlin({ common, themed }) {
  const colors = (m) => themed[m].filter((t) => t.$type === 'color');
  const cName = (t) => kName(t.path.slice(t.path[0] === 'color' ? 1 : 0));
  const obj = (title, head, doc) => [
    `/** ${doc} */`,
    `object ${title} {`,
    ...common.filter((t) => t.path[0] === head && t.$type === 'dimension').map((t) => `${t.$description ? `    /** ${t.$description} */\n` : ''}    val ${kName(t.path.slice(1))} = ${fmt(t.$value.value)}.dp`),
    '}',
  ].join('\n');
  const get = (p) => common.find((t) => t.path.join('.') === p).$value;
  const ts = (v) => `TextStyle(fontFamily = family, fontSize = ${fmt(v.fontSize.value)}.sp, lineHeight = ${lineHeightPx(v)}.sp, fontWeight = FontWeight.W${v.fontWeight}, letterSpacing = (${fmt(trackingEm(v))}).em)`;
  const ease = get('motion.easing.out');
  return `// ${HEADER}
// Стекло и тени не генерируются: на Android поверхности Material (PRODUCT.md, «Platform»).
package ${KOTLIN_PACKAGE}

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/** Смысловые цвета. Тема выбирает набор: GpLightColors или GpDarkColors. */
@Immutable
class GpColors(
${colors('light').map((t) => `    val ${cName(t)}: Color,`).join('\n')}
)

${MODES.map((m) => `val Gp${m[0].toUpperCase() + m.slice(1)}Colors = GpColors(\n${colors(m).map((t) => `    ${cName(t)} = ${kColor(t.$value)},`).join('\n')}\n)`).join('\n\n')}

${obj('GpSpace', 'space', 'Отступы и промежутки.')}

${obj('GpRadius', 'radius', 'Радиусы скругления. full — капсула: используйте CircleShape или RoundedCornerShape(50).')}

${obj('GpSize', 'size', 'Размеры элементов.')}

${obj('GpLayout', 'layout', 'Раскладка. breakpointWide — граница компактной и широкой раскладки.')}

/** Роли текста; family — Onest из ресурсов приложения. sp растут с системным масштабом шрифта. */
@Immutable
class GpTypography(family: FontFamily) {
${typeTokens(common).map((t) => `${t.$description ? `    /** ${t.$description} */\n` : ''}    val ${kName([roleName(t)])} = ${ts(t.$value)}`).join('\n')}

    companion object {
        /** Настройка «Крупнее»: множитель поверх системного масштаба шрифта. */
        const val TEXT_SCALE_LARGE = ${fmt(get('font.text-scale-large'))}f
    }
}

/** Движение. Длительности — миллисекунды. */
object GpMotion {
    const val PRESS = ${get('motion.duration.press').value}
    const val REVEAL = ${get('motion.duration.reveal').value}
    const val PULSE = ${get('motion.duration.pulse').value}
    const val PRESS_SCALE = ${fmt(get('motion.press-scale'))}f
    val EaseOut = CubicBezierEasing(${ease.map((x) => fmt(x) + 'f').join(', ')})
}
`;
}

// Цвета ресурсами Android: их читает то, что рисуется до Compose, — фон окна и заставка запуска (иначе окно
// мигнёт чужим цветом). Светлая тема — values, тёмная — values-night, имена — gp_<роль>.
function emitAndroidColorResources({ themed }) {
  const xName = (t) => 'gp_' + t.path.slice(t.path[0] === 'color' ? 1 : 0).join('_').replace(/-/g, '_');
  const xColor = (c) => {
    const [r, g, b] = rgb255(c);
    const a = Math.round(alphaOf(c) * 255);
    return '#' + [a, r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const file = (m) => `<?xml version="1.0" encoding="utf-8"?>
<!-- ${HEADER} -->
<resources>
${themed[m].filter((t) => t.$type === 'color').map((t) => `    <color name="${xName(t)}">${xColor(t.$value)}</color>`).join('\n')}
</resources>
`;
  return { 'android/res/values/gp_colors.xml': file('light'), 'android/res/values-night/gp_colors.xml': file('dark') };
}

// ---------- Шапка DESIGN.md ----------

// Формат DESIGN.md (google-labs-code/design.md): темы в схеме нет, поэтому у тёмных цветов суффикс -dark.
function emitFrontmatter({ common, themed }) {
  const q = (s) => JSON.stringify(s);
  const lines = ['---', 'name: GrePrepApp', 'description: Подготовка к GRE® шаг за шагом — спокойно, с разбором каждой ошибки', 'colors:'];
  for (const m of MODES) {
    for (const t of themed[m].filter((t) => t.$type === 'color')) {
      const n = t.path.slice(t.path[0] === 'color' ? 1 : 0).join('-') + (m === 'dark' ? '-dark' : '');
      lines.push(`  ${n}: ${q(cssColor(t.$value))}`);
    }
  }
  lines.push('typography:');
  for (const t of typeTokens(common)) {
    const v = t.$value;
    lines.push(`  ${roleName(t)}:`, `    fontFamily: ${q(family(v.fontFamily))}`, `    fontSize: ${q(px(v.fontSize))}`,
      `    fontWeight: ${v.fontWeight}`, `    lineHeight: ${q(px({ value: lineHeightPx(v), unit: 'px' }))}`,
      `    letterSpacing: ${q(fmt(trackingEm(v)) + 'em')}`);
  }
  for (const [key, head] of [['rounded', 'radius'], ['spacing', 'space']]) {
    lines.push(`${key}:`);
    for (const t of common.filter((t) => t.path[0] === head)) lines.push(`  ${q(t.path.slice(1).join('-'))}: ${q(px(t.$value))}`);
  }
  // Компоненты — ссылками на токены выше: шапка не должна разойтись с источником.
  lines.push('components:',
    '  button-main:', '    backgroundColor: "{colors.accent}"', '    textColor: "{colors.on-accent}"', '    rounded: "{rounded.full}"', '    height: "48px"', '    padding: "0 24px"',
    '  button-telegram-main:', '    backgroundColor: "{colors.accent}"', '    textColor: "{colors.on-accent}"', '    rounded: "{rounded.md}"', '    height: "50px"',
    '  button-secondary:', '    backgroundColor: "{colors.surface}"', '    textColor: "{colors.text}"', '    rounded: "{rounded.full}"', '    height: "44px"', '    padding: "0 16px"',
    '  card:', '    backgroundColor: "{colors.surface}"', '    textColor: "{colors.text}"', '    rounded: "{rounded.xxl}"', '    padding: "16px"',
    '  answer-option:', '    backgroundColor: "{colors.surface}"', '    textColor: "{colors.text}"', '    rounded: "{rounded.lg}"', '    height: "56px"', '    padding: "0 16px"',
    '  chip-section:', '    backgroundColor: "{colors.verbal-tint}"', '    textColor: "{colors.verbal}"', '    rounded: "{rounded.full}"', '    height: "32px"', '    padding: "0 14px"',
    '  tab-bar:', '    rounded: "{rounded.full}"', '    height: "64px"', '    width: "340px"', '    padding: "4px"',
    '  step-node-current:', '    backgroundColor: "{colors.verbal}"', '    textColor: "{colors.surface}"', '    rounded: "{rounded.full}"', '    size: "36px"',
    '  step-node:', '    backgroundColor: "{colors.surface}"', '    textColor: "{colors.verbal}"', '    rounded: "{rounded.full}"', '    size: "28px"',
    '---');
  return lines.join('\n') + '\n';
}

// ---------- Запись ----------

export async function render() {
  const parts = split(await resolveModes());
  const files = {
    'web/tokens.css': emitCss(parts),
    'apple/GPTokens.swift': emitSwift(parts, JSON.parse(await readFile(join(here, 'src/apple/control.json'), 'utf8'))),
    'android/GpTokens.kt': emitKotlin(parts),
    ...emitAndroidColorResources(parts),
    ...Object.fromEntries(Object.entries(emitColorAssets(parts)).map(([k, v]) => ['apple/' + k, v])),
  };
  return { files, frontmatter: emitFrontmatter(parts) };
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const res = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) res.push(...(await walk(p)));
    else res.push(p);
  }
  return res;
}

function withFrontmatter(doc, fm) {
  if (!doc.startsWith('---\n')) return fm + '\n' + doc;
  const end = doc.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('DESIGN.md: шапка начата, но не закрыта');
  return fm + doc.slice(end + 5);
}

async function main() {
  const check = process.argv.includes('--check');
  const { files, frontmatter } = await render();
  const designPath = join(repo, 'DESIGN.md');
  const design = await readFile(designPath, 'utf8').catch(() => '');
  const want = { ...Object.fromEntries(Object.entries(files).map(([k, v]) => [join(out, k), v])), [designPath]: withFrontmatter(design, frontmatter) };

  if (check) {
    const stale = [];
    for (const [p, v] of Object.entries(want)) if ((await readFile(p, 'utf8').catch(() => null)) !== v) stale.push(relative(repo, p));
    for (const p of await walk(out)) if (!(p in want)) stale.push(relative(repo, p) + ' (лишний)');
    if (stale.length) {
      console.error(`Токены разошлись с design/tokens/src — запустите pnpm --dir design/tokens build:\n  ${stale.join('\n  ')}`);
      process.exit(1);
    }
    console.log('Токены совпадают с источником.');
    return;
  }
  await rm(out, { recursive: true, force: true });
  for (const [p, v] of Object.entries(want)) {
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, v);
  }
  console.log(`Собрано: ${Object.keys(files).length} файлов в design/tokens/generated и шапка DESIGN.md.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
