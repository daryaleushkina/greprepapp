// Снимок каталога без общего браузера и без сервера (страница открывается из файла):
//   node design/night-studio/shot.mjs <группа T|R|L|W|X|G|all> <phone|desktop> <light|dark|both> <out.png> [id экрана]
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const [group = 'all', device = 'phone', theme = 'both', out = 'shot.png', id] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
await page.addInitScript((s) => localStorage.setItem('night-studio', s), JSON.stringify({ group, device, theme }));
await page.goto(pathToFileURL(join(here, 'index.html')).href);
// Липкая шапка каталога иначе закрывает верх первого ряда рамок.
await page.addStyleTag({ content: '.cat-head{position:static}' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.locator(id ? `#${id}` : '#board').screenshot({ path: out });
await browser.close();
console.log(out);
