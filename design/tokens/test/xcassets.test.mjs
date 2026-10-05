// Каталог цветов Apple: Xcode читает компонент без десятичной точки как целое 0–255, а не долю 0–1.
// «1» превращается в 1/255 — непрозрачный цвет становится почти невидимым (так было с alpha и белым).
// Поэтому каждый компонент в generated/apple/GPColors.xcassets обязан быть десятичной дробью.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../generated/apple/GPColors.xcassets/', import.meta.url).pathname;

test('компоненты цветов Apple — десятичные дроби 0–1', () => {
  const sets = readdirSync(root).filter((d) => d.endsWith('.colorset'));
  assert.ok(sets.length > 0, 'каталог цветов пуст');
  for (const set of sets) {
    const json = JSON.parse(readFileSync(join(root, set, 'Contents.json'), 'utf8'));
    for (const entry of json.colors) {
      for (const [name, value] of Object.entries(entry.color.components)) {
        assert.match(value, /^\d\.\d+$/, `${set}: ${name} = "${value}" — Xcode прочтёт как 0–255`);
        const n = Number(value);
        assert.ok(n >= 0 && n <= 1, `${set}: ${name} = ${value} вне 0–1`);
      }
    }
  }
});
