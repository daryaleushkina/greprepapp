import test from 'node:test';
import assert from 'node:assert/strict';
import { render, resolveModes } from '../build.mjs';

test('Прозрачность выключенного элемента — общий смысловой токен всех платформ', async () => {
  const modes = await resolveModes();
  for (const mode of ['light', 'dark']) {
    const token = modes[mode].find((t) => t.path.join('.') === 'opacity.disabled');
    assert.equal(token?.$type, 'number');
    assert.equal(token?.$value, 0.5);
  }
  const { files, frontmatter } = await render();
  assert.match(files['web/tokens.css'], /--opacity-disabled: 0\.5;/);
  assert.match(files['apple/GPTokens.swift'], /enum GPOpacity[\s\S]*disabled: Double = 0\.5/);
  assert.match(files['android/GpTokens.kt'], /object GpOpacity[\s\S]*const val DISABLED = 0\.5f/);
  assert.match(frontmatter, /opacity:\n  disabled: 0\.5/);
});
