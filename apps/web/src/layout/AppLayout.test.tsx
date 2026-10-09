import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { fakeServer, json, renderApp, STARTER, user } from '../test/app';

const signedIn = { 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER) };

describe('разделы', () => {
  it.each([
    { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 },
  ])('«Назад» оставляет браузеру клик %j', async (options) => {
    fakeServer(signedIn);
    const { screen, router } = await renderApp({ path: '/progress' });
    await router.navigate({ to: '/settings' });
    const back = screen.getByRole('link', { name: 'Назад' });
    await expect.element(back).toBeVisible();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...options });
    let intercepted = false;
    // После обработчиков React гасим родную навигацию только в тестовом iframe Vitest.
    document.addEventListener('click', (click) => {
      intercepted = click.defaultPrevented;
      click.preventDefault();
    }, { once: true });
    back.element().dispatchEvent(event);
    expect(intercepted).toBe(false);
    expect(router.state.location.pathname).toBe('/settings');
  });

  it('телефон: капсула вкладок ведёт по разделам; настройки — из «Прогресса», с «Назад» и без капсулы', async () => {
    fakeServer(signedIn);
    const { screen, router } = await renderApp({ path: '/' });
    const tabs = screen.getByRole('navigation', { name: 'Разделы' }).last();
    await tabs.getByRole('link', { name: 'Слова' }).click();
    await expect.element(screen.getByText('Здесь будет словарь: слова на сегодня, повторение и поиск.')).toBeVisible();
    await expect.element(tabs.getByRole('link', { name: 'Слова' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'Экзамен' }).click();
    await expect.element(screen.getByText('Здесь будут пробный экзамен как настоящий GRE и эссе с оценкой.')).toBeVisible();
    await tabs.getByRole('link', { name: 'Прогресс' }).click();
    await expect.element(screen.getByText('Тренировок ещё не было')).toBeVisible();
    await screen.getByRole('link', { name: 'Настройки' }).last().click();
    await expect.poll(() => router.state.location.pathname).toBe('/settings');
    // Скрытая капсула выпадает из дерева доступности — её больше не найти по роли.
    await expect.poll(() => screen.getByRole('navigation', { name: 'Разделы' }).elements().length).toBe(0);
    await screen.getByRole('link', { name: 'Назад' }).click();
    await expect.poll(() => router.state.location.pathname).toBe('/progress');
  });

  it('компьютер: боковая панель с настройками внизу, капсулы нет', async () => {
    await page.viewport(1280, 800);
    fakeServer(signedIn);
    const { screen } = await renderApp({ path: '/' });
    const side = screen.getByRole('navigation', { name: 'Разделы' }).first();
    await expect.element(side.getByRole('link', { name: 'Настройки' })).toBeVisible();
    // Капсулы нет (скрытое не в дереве доступности): навигация одна — панель.
    expect(screen.getByRole('navigation', { name: 'Разделы' }).elements()).toHaveLength(1);
    await side.getByRole('link', { name: 'Настройки' }).click();
    await expect.element(screen.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    // Шире 600 px «Назад» у настроек не нужен — есть панель.
    expect(screen.getByRole('link', { name: 'Назад' }).elements()).toHaveLength(0);
    await page.viewport(390, 844);
  });

  it('шаг открывается в режиме фокуса и возвращается на «Сегодня»', async () => {
    fakeServer(signedIn);
    const { screen, router } = await renderApp({ path: '/step/verbal' });
    await expect.element(screen.getByText('Шаг verbal')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Разделы' }).elements()).toHaveLength(0);
    await screen.getByRole('link', { name: 'Назад' }).click();
    await expect.poll(() => router.state.location.pathname).toBe('/');
  });
});

describe('вкладка горит по пути', () => {
  it('мини-апп: «Сегодня» текущая и с параметрами запуска Telegram в адресе', async () => {
    fakeServer({ 'POST /api/auth/telegram-mini-app': () => json({ token: 't', expiresAt: '2026-11-05T10:00:00Z', user: user() }), 'GET /api/today': () => json(STARTER) });
    const { screen } = await renderApp({
      path: '/tg/?tgTheme=dark&tgPlatform=ios',
      shell: 'telegram',
      launch: { initDataRaw: 'hash=x', languageCode: 'ru' },
    });
    await expect.element(screen.getByRole('link', { name: 'Сегодня' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('сессия кончилась на экране шага', () => {
  it('сразу на вход с «Вход закончился», без повторов отказа сервера', async () => {
    let todayCalls = 0;
    fakeServer({
      'GET /api/me': () => json(user()),
      'GET /api/today': () => {
        todayCalls++;
        return new Response(JSON.stringify({ code: 'unauthorized', message: 'x', requestId: 'r' }), { status: 401 });
      },
    });
    const { screen } = await renderApp({ path: '/step/verbal' });
    await expect.element(screen.getByText('Вход закончился — войдите снова.')).toBeVisible();
    expect(todayCalls).toBe(1);
  });
});
