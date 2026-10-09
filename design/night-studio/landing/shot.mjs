// Снимок варианта главной из файла:
//   node design/night-studio/landing/shot.mjs <a|b|c|d> <ширина 1440|390> <light|dark> <out.png> [задержка мс=4000] [full]
// Тема задаётся атрибутом data-theme на <html>, как это делает переключатель на странице.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const [variant = 'a', width = '1440', theme = 'dark', out = 'shot.png', delay = '4000', full] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(width) > 600 ? 900 : 844 } });
await page.addInitScript((t) => { try { localStorage.setItem('landing-theme', t); } catch { /* без памяти */ } document.documentElement.dataset.theme = t; }, theme);
await page.goto(pathToFileURL(join(here, `${variant}.html`)).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(Number(delay));
await page.screenshot({ path: out, fullPage: full === 'full' });
await browser.close();
console.log(out);
