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
test('ошибка IndexedDB при входе не показывает чужие данные', async () => {
  fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/trainings/options': () => json(trainingOptions()) });
  vi.spyOn(trainingRepository.store, 'signIn').mockRejectedValueOnce(new Error('storage unavailable'));
  const { screen } = await renderApp({ path: '/training/new' }); await expect.element(screen.getByRole('heading', { name: 'Не получилось войти' })).toBeVisible();
});
