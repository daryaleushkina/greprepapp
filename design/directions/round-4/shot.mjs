// Снимок каталога раунда 4 без общего браузера: node design/directions/round-4/shot.mjs <dir a|b|c|d|all> <phone|desktop> <light|dark|both> <out.png> [screen]
// Каталог должен раздаваться на http://localhost:8744 (python3 -m http.server 8744 в этой папке).
import { chromium } from 'playwright';
const [dir = 'a', device = 'phone', theme = 'both', out = 'shot.png', screen = 'all'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: device === 'desktop' ? 1760 : 1800, height: 1000 } });
await page.addInitScript((s) => localStorage.setItem('round4', s), JSON.stringify({ dir, device, theme, screen }));
await page.goto('http://localhost:8744/index.html');
// Липкая шапка каталога иначе закрывает верх первого ряда рамок на снимке.
await page.addStyleTag({ content: '.cat-head{position:static}' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const board = page.locator('#board');
await board.screenshot({ path: out });
await browser.close();
console.log(out);
