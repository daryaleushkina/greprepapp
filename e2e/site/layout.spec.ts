// Сайт по ширине: телефон — капсула вкладок снизу, 600–899 px — строка разделов сверху, шире — боковая панель
// (решение Даши 06.10.2026). Проекты site-phone, site-medium и site-desktop-* гоняют один сценарий на своей ширине.
import { expect, navLink, test } from '../fixtures';

test('разделы и настройки на своей ширине', async ({ site: page }) => {
  const width = page.viewportSize()?.width ?? 0;
  for (const [tab, text] of [
    ['Слова', 'Здесь будет словарь: слова на сегодня, повторение и поиск.'],
    ['Экзамен', 'Здесь будут пробный экзамен как настоящий GRE и эссе с оценкой.'],
    ['Прогресс', 'Тренировок ещё не было'],
    ['Сегодня', 'Три шага · около 25 минут'],
  ] as const) {
    await navLink(page, tab).click();
    await expect(page.getByText(text)).toBeVisible();
    await expect(navLink(page, tab)).toHaveAttribute('aria-current', 'page');
  }

  if (width < 600) {
    // Телефон: капсула внизу, настройки — из «Прогресса», без капсулы и с «Назад».
    await expect(page.locator('.tabbar')).toBeVisible();
    await navLink(page, 'Прогресс').click();
    await page.getByRole('link', { name: 'Настройки' }).click();
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    await expect(page.locator('.tabbar')).toBeHidden();
    await page.getByRole('link', { name: 'Назад' }).click();
    await expect(page.getByText('Тренировок ещё не было')).toBeVisible();
  } else {
    // Шире: капсулы нет, «Настройки» — пункт панели; «Назад» на настройках не нужен.
    await expect(page.locator('.tabbar')).toBeHidden();
    await navLink(page, 'Настройки').click();
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Назад' })).toBeHidden();
    const panel = await page.getByRole('navigation', { name: 'Разделы' }).boundingBox();
    // Панель: шире 900 px — колонка слева во всю высоту, уже — строка сверху.
    if (width >= 900) expect(panel?.height ?? 0).toBeGreaterThan(600);
    else expect(panel?.width ?? 0).toBeGreaterThan(width - 40);
  }
});

test('шаг — режим фокуса без разделов, «Назад» — на «Сегодня»', async ({ site: page }) => {
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByRole('heading', { name: 'Слова: повторение' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Назад' }).click();
  await expect(page.getByText('Три шага · около 25 минут')).toBeVisible();
});
