// Настройка бота через Bot API: webhook, кнопка меню с мини-аппом, имя, команды, описания. Из LifeCommit.
// Запуск: node scripts/setup-bot.mjs  (TELEGRAM_BOT_TOKEN и WEBHOOK_SECRET — из .env.local, APP_URL — адрес мини-аппа)
// Только тексты (имя, описания и команды), не трогая webhook и кнопку меню: node scripts/setup-bot.mjs --texts
// Webhook — ${APP_URL}/bot/webhook: путь Worker'а из каркаса LifeCommit (docs/ROADMAP.md, п. 1).
import { readFileSync } from 'node:fs';

// Имя и тексты бота решает Даша. Пока их нет (null) — тексты пропускаются, а не уходят в Telegram заглушкой.
// Формат: { name: 'GrePrepApp', langs: [['ru', [{ command: 'start', description: '…' }], 'описание до 512', 'короткое до 120'],
//           ['', [...], 'English description', 'short']] } — пустой язык означает «все остальные».
const TEXTS = null;

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const TOKEN = env.TELEGRAM_BOT_TOKEN;
const SECRET = env.WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL ?? env.APP_URL;
if (!TOKEN || !SECRET) throw new Error('Нет TELEGRAM_BOT_TOKEN или WEBHOOK_SECRET в .env.local');

async function call(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  console.log(`${body.ok ? '✓' : '✗'} ${method}${body.ok ? '' : `: ${body.description}`}`);
  if (!body.ok) process.exitCode = 1;
}

if (!process.argv.includes('--texts')) {
  if (!APP_URL) throw new Error('Нет APP_URL (в окружении или в .env.local) — некуда вести webhook и кнопку меню');
  await call('setWebhook', {
    url: `${APP_URL}/bot/webhook`,
    secret_token: SECRET,
    allowed_updates: ['message', 'my_chat_member', 'callback_query'],
    // Каждый запуск выбрасывает накопившиеся у Telegram обновления — так в LifeCommit; не гонять при живых людях без нужды.
    drop_pending_updates: true,
  });
  await call('setChatMenuButton', {
    menu_button: { type: 'web_app', text: TEXTS?.name ?? 'Открыть', web_app: { url: APP_URL } },
  });
}

if (!TEXTS) {
  console.log('… тексты бота не заданы (TEXTS в scripts/setup-bot.mjs) — имя, команды и описания пропущены');
} else {
  await call('setMyName', { name: TEXTS.name });
  for (const [lang, cmds, description, short] of TEXTS.langs) {
    const language_code = lang || undefined;
    await call('setMyCommands', { commands: cmds, language_code });
    await call('setMyDescription', { description, language_code });
    await call('setMyShortDescription', { short_description: short, language_code });
  }
}
