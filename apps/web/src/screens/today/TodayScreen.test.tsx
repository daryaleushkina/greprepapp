import { onlineManager } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { apiError, fakeServer, json, plan, renderApp, STARTER, step, user } from '../../test/app';

const signedIn = { 'GET /api/me': () => json(user()) };

describe('«Сегодня»', () => {
  it('лента с сервера: сводка, текущий шаг на стекле с «Начать», конец ленты', async () => {
    fakeServer({ ...signedIn, 'GET /api/today': () => json(STARTER) });
    const { screen } = await renderApp({ path: '/' });
    await expect.element(screen.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible();
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Сейчас: Шаг words' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Начать' })).toBeVisible();
    await expect.element(screen.getByRole('link', { name: /Шаг verbal/ })).toBeVisible();
    await expect.element(screen.getByText('На сегодня всё.')).toBeVisible();
  });

  it('всё пройдено — «На сегодня всё» и завтрашний план', async () => {
    fakeServer({ ...signedIn, 'GET /api/today': () => json(plan([step('a', 'done', 'verbal', 12), step('b', 'done', 'quant', 9)])) });
    const { screen } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('Два шага · 21 минута')).toBeVisible();
    await expect.element(screen.getByText('На сегодня всё', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('Завтра здесь будет новый план.')).toBeVisible();
    // Пройденный шаг — строка без перехода.
    expect(screen.getByRole('link', { name: /Шаг a/ }).elements()).toHaveLength(0);
  });

  it('пустой план', async () => {
    fakeServer({ ...signedIn, 'GET /api/today': () => json(plan([])) });
    const { screen } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('На сегодня шагов нет')).toBeVisible();
  });

  it('сервер не ответил — «Не получилось загрузить план», «Повторить» загружает', async () => {
    let fail = true;
    fakeServer({ ...signedIn, 'GET /api/today': () => (fail ? apiError(500, 'internal') : json(STARTER)) });
    const { screen } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('Не получилось загрузить план')).toBeVisible();
    fail = false;
    await screen.getByRole('button', { name: 'Повторить' }).click();
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
  });

  it('нет сети при загрузке — «Нет сети», план появляется, когда сеть вернулась', async () => {
    fakeServer({ ...signedIn, 'GET /api/today': () => json(STARTER) });
    onlineManager.setOnline(false);
    const { screen } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('План на сегодня загрузится, когда появится сеть.')).toBeVisible();
    onlineManager.setOnline(true);
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
  });

  it('без сети шаг не начинается — объяснение у шага; с сетью — открывается', async () => {
    fakeServer({ ...signedIn, 'GET /api/today': () => json(STARTER) });
    const { screen, router } = await renderApp({ path: '/' });
    await expect.element(screen.getByRole('button', { name: 'Начать' })).toBeVisible();
    onlineManager.setOnline(false);
    await expect.element(screen.getByText('Нет сети — план обновится сам, когда она появится.')).toBeVisible();
    await screen.getByRole('button', { name: 'Начать' }).click();
    await expect.element(screen.getByText('Чтобы начать, нужна сеть. Когда она появится, всё заработает.')).toBeVisible();
    await screen.getByRole('link', { name: /Шаг verbal/ }).click();
    expect(router.state.location.pathname).toBe('/');
    onlineManager.setOnline(true);
    await screen.getByRole('link', { name: /Шаг verbal/ }).click();
    await expect.poll(() => router.state.location.pathname).toBe('/step/verbal');
    await expect.element(screen.getByText('Здесь начнётся шаг. Тренировки и слова появятся в следующих частях.')).toBeVisible();
  });

  it('Enter начинает текущий шаг, когда фокус ни на чём; на кнопке и в поле Enter делает своё', async () => {
    fakeServer({ ...signedIn, 'GET /api/today': () => json(STARTER) });
    const { screen, router } = await renderApp({ path: '/' });
    await expect.element(screen.getByRole('button', { name: 'Начать' })).toBeVisible();
    (document.activeElement as HTMLElement | null)?.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await expect.poll(() => router.state.location.pathname).toBe('/step/words');
  });

  it('с Shift, повтором или фокусом на ссылке Enter шаг не начинает; простой Enter — один переход', async () => {
    fakeServer({ ...signedIn, 'GET /api/today': () => json(STARTER) });
    const { screen, router } = await renderApp({ path: '/' });
    await expect.element(screen.getByRole('button', { name: 'Начать' })).toBeVisible();
    const visited: string[] = [];
    const stop = router.history.subscribe(() => visited.push(router.history.location.pathname));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }));
    const link = screen.getByRole('link', { name: /Шаг verbal/ }).element();
    if (!(link instanceof HTMLElement)) throw new Error('no step link');
    link.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    link.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await expect.poll(() => router.state.location.pathname).toBe('/step/words');
    stop();
    // Был ровно один переход — от простого Enter без фокуса; Shift, повтор и Enter на ссылке ничего не начали.
    expect(visited).toEqual(['/step/words']);
  });

  it('сеть вернулась — объяснение «нужна сеть» у шага пропадает само', async () => {
    fakeServer({ ...signedIn, 'GET /api/today': () => json(STARTER) });
    const { screen } = await renderApp({ path: '/' });
    await expect.element(screen.getByRole('button', { name: 'Начать' })).toBeVisible();
    onlineManager.setOnline(false);
    await screen.getByRole('button', { name: 'Начать' }).click();
    const hint = screen.getByText('Чтобы начать, нужна сеть. Когда она появится, всё заработает.');
    await expect.element(hint).toBeVisible();
    onlineManager.setOnline(true);
    await expect.poll(() => hint.elements().length).toBe(0);
  });

  it('обновить не вышло — прошлый план остаётся, над ним тихая строка', async () => {
    let fail = false;
    fakeServer({ ...signedIn, 'GET /api/today': () => (fail ? apiError(500, 'internal') : json(STARTER)) });
    const { screen, queryClient } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    fail = true;
    await queryClient.refetchQueries({ queryKey: ['/api/today'] });
    await expect.element(screen.getByText('Не получилось обновить план — покажем свежий, как только сервер ответит.')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Начать' })).toBeVisible();
  });

  it('ответ не по договору — ошибка уходит в отчёт', async () => {
    const { requests } = fakeServer({
      ...signedIn,
      'GET /api/today': () => json({ date: '2026-10-06', steps: [{ id: 'x', section: 'chemistry', title: 't', minutes: 1, state: 'next' }] }),
      'POST /api/client-errors': () => new Response(null, { status: 204 }),
    });
    const { screen } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('Не получилось загрузить план')).toBeVisible();
    await expect.poll(() => requests.some((r) => new URL(r.url).pathname === '/api/client-errors')).toBe(true);
    const report = requests.find((r) => new URL(r.url).pathname === '/api/client-errors');
    const body: unknown = await report?.json();
    expect(body).toMatchObject({ clientKind: 'web', route: '/', message: expect.stringContaining('does not match the contract') });
  });

  it('запрос плана рвётся (нет сети на деле, хотя браузер «в сети») — после повторов «Нет сети»', async () => {
    let calls = 0;
    fakeServer({
      ...signedIn,
      'GET /api/today': () => {
        calls++;
        throw new TypeError('Failed to fetch');
      },
    });
    const { screen } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('План на сегодня загрузится, когда появится сеть.')).toBeVisible();
    // Повтор лечит только сеть: первая попытка и три повтора.
    expect(calls).toBe(4);
  });

  it('сайт: сессия кончилась, когда план уже был на экране, — план стёрт, на вход', async () => {
    let expired = false;
    fakeServer({ ...signedIn, 'GET /api/today': () => (expired ? apiError(401, 'unauthorized') : json(STARTER)) });
    const { screen, router, queryClient } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    expired = true;
    await queryClient.refetchQueries({ queryKey: ['/api/today'] });
    await expect.element(screen.getByText('Вход закончился — войдите снова.')).toBeVisible();
    expect(router.state.location.pathname).toBe('/signin');
    expect(queryClient.getQueryData(['/api/today'])).toBeUndefined();
  });

  it('сессия кончилась посреди работы — на вход с «Вход закончился»', async () => {
    fakeServer({ ...signedIn, 'GET /api/today': () => apiError(401, 'unauthorized') });
    const { screen, router } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('Вход закончился — войдите снова.')).toBeVisible();
    expect(router.state.location.pathname).toBe('/signin');
  });
});
