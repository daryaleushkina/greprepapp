import { expect, test, vi } from 'vitest';
import { apiError, fakeServer, json, renderApp, STARTER, user } from '../test/app';
import { givenAnswer, trainingOptions, trainingSession } from '../test/training';
import { storedTraining } from './model';
import { trainingRepository } from './repository';

test('настоящий 401 очереди сохраняет ответы; вход через интерфейс того же человека отправляет их', async () => {
  let expired = true;
  const server = fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER),
    'POST /api/auth/dev': () => json({ expiresAt: '2026-11-06T00:00:00Z', user: user() }),
    ['POST /api/trainings/' + trainingSession().id + '/answers']: () => expired ? apiError(401, 'unauthorized') : new Response(null, { status: 204 }) });
  const { screen } = await renderApp({ path: '/' }); await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  const owner = await trainingRepository.store.signIn(user().id);
  await trainingRepository.store.put(owner, { ...storedTraining(trainingSession(), Date.now()), answers: { 0: givenAnswer() }, unsent: [0] });
  await trainingRepository.sync(); await expect.element(screen.getByText('Вход закончился — войдите снова.')).toBeVisible();
  expect((await trainingRepository.store.get(owner, trainingSession().id))?.unsent).toEqual([0]);
  expired = false; await screen.getByPlaceholder('Имя тестового пользователя').fill('Тест'); await screen.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  await expect.poll(async () => (await trainingRepository.store.get(owner, trainingSession().id))?.unsent).toEqual([]);
  expect(server.requests.filter((r) => r.url.endsWith('/answers'))).toHaveLength(2);
});
test('скрытая вкладка не отправляет; возврат отправляет', async () => {
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER) });
  const { screen } = await renderApp({ path: '/' }); await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  const sync = vi.spyOn(trainingRepository, 'requestSync').mockImplementation(() => {});
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange')); expect(sync).not.toHaveBeenCalled();
});
test('ошибка IndexedDB оставляет вход рабочим, а тренировку недоступной', async () => {
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER), 'GET /api/trainings/options': () => json(trainingOptions()) });
  vi.spyOn(trainingRepository.store, 'signIn').mockRejectedValueOnce(new Error('storage unavailable'));
  const { screen } = await renderApp({ path: '/' });
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  await screen.getByRole('link', { name: 'Своя тренировка' }).click();
  await expect.element(screen.getByText('Нет места на устройстве')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Начать ·/ })).toBeDisabled();
});

test('сбой очистки после выхода на сервере не оставляет экран вошедшим; другой вход стирает очередь', async () => {
  let who = user();
  fakeServer({ 'GET /api/me': () => json(who), 'GET /api/today': () => json(STARTER),
    'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    'POST /api/auth/dev': () => json({ expiresAt: '2026-11-06T00:00:00Z', user: who }) });
  const { screen, router } = await renderApp({ path: '/' });
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  const owner = await trainingRepository.store.signIn(who.id);
  await trainingRepository.store.put(owner, { ...storedTraining(trainingSession(), Date.now()), answers: { 0: givenAnswer() }, unsent: [0] });
  vi.spyOn(trainingRepository.store, 'signOut').mockRejectedValueOnce(new Error('private'));
  await router.navigate({ to: '/settings' });
  await screen.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: 'Войти через Telegram' })).toBeVisible();
  who = user({ id: '00000000-0000-4000-8000-000000000002' });
  await screen.getByPlaceholder('Имя тестового пользователя').fill('Другой');
  await screen.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  await expect.poll(() => trainingRepository.list()).toEqual([]);
});

test('изменение одной тренировки не инвалидирует другую', async () => {
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER) });
  const { screen, queryClient } = await renderApp({ path: '/' });
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  vi.spyOn(trainingRepository, 'requestSync').mockImplementation(() => {});
  const owner = await trainingRepository.store.signIn(user().id);
  await trainingRepository.store.put(owner, storedTraining(trainingSession(), Date.now()));
  const key = ['training', user().id, 'other'];
  queryClient.setQueryData(key, 'untouched');
  await trainingRepository.moveTo(trainingSession().id, 1);
  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
});

test('после сбоя хранилища кэш не предлагает недоступную тренировку', async () => {
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER) });
  const { screen } = await renderApp({ path: '/' });
  await expect.element(screen.getByRole('link', { name: 'Своя тренировка' })).toBeVisible();
  const owner = await trainingRepository.store.signIn(user().id);
  await trainingRepository.store.put(owner, storedTraining(trainingSession(), Date.now()));
  await expect.element(screen.getByRole('link', { name: /Продолжить тренировку/ })).toBeVisible();
  vi.spyOn(trainingRepository.store, 'get').mockRejectedValueOnce(new DOMException('private', 'SecurityError'));
  await trainingRepository.get(trainingSession().id);
  await expect.element(screen.getByRole('link', { name: /Продолжить тренировку/ })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('link', { name: 'Своя тренировка' })).toBeVisible();
});
