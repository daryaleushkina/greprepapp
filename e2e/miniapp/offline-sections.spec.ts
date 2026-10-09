// Ленивые разделы сохраняют живой мини-апп при потере сети.
import { expect, miniAppUrl, navLink, test } from '../fixtures';

test('после первого экрана все вкладки открываются без сети и перезагрузки', async ({ miniApp: page, context }) => {
  // WebKit вносит шум в performance.timeOrigin; метка принадлежит самому документу и исчезнет при reload.
  const documentId = await page.evaluate(() => document.documentElement.dataset.testDocument = crypto.randomUUID());
  // Дожидаемся фоновой загрузки разделов, не открывая их: сеть пропадёт до первого перехода.
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
    .some((entry) => /(?:sections\.lazy|ProgressScreen)-.*\.js/.test(entry.name)))).toBe(true);
  await context.setOffline(true);
  for (const name of ['Слова', 'Экзамен', 'Прогресс', 'Сегодня']) {
    await navLink(page, name).click();
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.testDocument)).toBe(documentId);
  }
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
});

test('незагруженный раздел — «Нет сети»; повтор открывает его без перезагрузки', async ({ page, watch, tgUser, tgTheme, tgPlatform, tgInsets }) => {
  watch(page);
  let fail = true;
  // Имитация потери сети только для куска: запросы входа и первого плана проходят.
  await page.route(/\/(?:sections\.lazy|ProgressScreen)-[^/]+\.js(?:\?.*)?$/, (route) => fail ? route.abort('internetdisconnected') : route.continue());
  await page.goto(miniAppUrl(tgUser, { tgTheme, tgPlatform, tgInsets }));
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
  // WebKit вносит шум в performance.timeOrigin; метка принадлежит самому документу и исчезнет при reload.
  const documentId = await page.evaluate(() => document.documentElement.dataset.testDocument = crypto.randomUUID());
  await navLink(page, 'Прогресс').click();
  await expect(page.getByRole('heading', { name: 'Нет сети', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.testDocument)).toBe(documentId);
  fail = false;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByText('Тренировок ещё не было')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.testDocument)).toBe(documentId);
});

test('незагруженный шаг остаётся в полноэкранной оболочке и открывается после повтора', async ({ page, watch, tgUser, tgTheme, tgPlatform, tgInsets }) => {
  watch(page);
  let fail = true;
  await page.route(/\/sections\.lazy-[^/]+\.js(?:\?.*)?$/, (route) => fail ? route.abort('internetdisconnected') : route.continue());
  await page.goto(miniAppUrl(tgUser, { tgTheme, tgPlatform, tgInsets }));
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Нет сети', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Повторение', exact: true })).toBeVisible();
});
