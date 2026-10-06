// Мини-апп: вход без экранов (initData) и «Сегодня» с сервера — сквозной путь каркаса (docs/ROADMAP.md §2).
import { expect, miniAppUrl, navLink, newTelegramUser, signInitData, test } from '../fixtures';

const STEPS_RU = ['Слова: повторение', 'Verbal: Text Completion', 'Quant: Quantitative Comparison'];

test('вход по initData — сразу «Сегодня» с планом сервера', async ({ miniApp: page }) => {
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
  for (const title of STEPS_RU) await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: `Сейчас: ${STEPS_RU[0]}` }).getByRole('button', { name: 'Начать' })).toBeVisible();
  await expect(page.getByText('На сегодня всё.')).toBeVisible();
  await expect(navLink(page, 'Сегодня')).toHaveAttribute('aria-current', 'page');
});

test('«Начать» открывает шаг, «назад» Telegram возвращает на «Сегодня»', async ({ miniApp: page }) => {
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByText('Здесь начнётся шаг. Тренировки и слова появятся в следующих частях.')).toBeVisible();
  await expect(page.getByRole('heading', { name: STEPS_RU[0] })).toBeVisible();
  // Вкладок внутри шага нет — назад только кнопкой Telegram (её рисует подмена клиента).
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toHaveCount(0);
  await page.locator('#tg-mock-back').click();
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
  await expect(page.locator('#tg-mock-back')).toBeHidden();
});

test('без сети новый шаг не начинается — объяснение у шага; сеть вернулась — начинается', async ({ miniApp: page, context }) => {
  // План уже на экране: без сети он остаётся (если уйти в офлайн раньше, экран честно покажет «Нет сети»).
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText('Нет сети — план обновится сам, когда она появится.')).toBeVisible();
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByText('Чтобы начать, нужна сеть. Когда она появится, всё заработает.')).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('link', { name: /Verbal: Text Completion/ }).click();
  await expect(page.getByRole('heading', { name: 'Verbal: Text Completion' })).toBeVisible();
});

test('вкладки и настройки из «Прогресса»; выхода в мини-аппе нет', async ({ miniApp: page }) => {
  await navLink(page, 'Слова').click();
  await expect(page.getByText('Здесь будет словарь: слова на сегодня, повторение и поиск.')).toBeVisible();
  await navLink(page, 'Экзамен').click();
  await expect(page.getByText('Здесь будут пробный экзамен как настоящий GRE и эссе с оценкой.')).toBeVisible();
  await navLink(page, 'Прогресс').click();
  await expect(page.getByText('Тренировок ещё не было')).toBeVisible();
  await page.getByRole('link', { name: 'Настройки' }).click();
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  await expect(page.getByText('Версия e2e')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выйти' })).toHaveCount(0);
  await page.locator('#tg-mock-back').click();
  await expect(page.getByText('Тренировок ещё не было')).toBeVisible();
});

test('подделанная initData — сервер отказывает, «Не получилось войти» и «Повторить»', async ({ page, watch, tgTheme, tgPlatform, tgInsets }) => {
  watch(page);
  const user = newTelegramUser();
  const forged = new URLSearchParams(signInitData(user));
  forged.set('user', JSON.stringify({ ...user, id: user.id + 1 })); // подпись — от другого человека
  const url = new URL(miniAppUrl(user, { tgTheme, tgPlatform, tgInsets }), 'https://x');
  url.searchParams.set('tgInitData', forged.toString());
  await page.goto(url.pathname + url.search);
  await expect(page.getByText('Не получилось войти. Попробуйте ещё раз.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
});

test.describe('английский Telegram', () => {
  test.use({ tgUser: newTelegramUser({ language_code: 'en' }) });

  test('интерфейс и план — по-английски', async ({ miniApp: page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByText('Three steps · about 25 minutes')).toBeVisible();
    await expect(page.getByText('Words: review', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });
});
