import { expect, test, vi } from 'vitest';
import { fakeServer, json, renderApp, STARTER, user } from '../test/app';
import { trainingOptions, trainingSession } from '../test/training';

const sdk = vi.hoisted(() => {
  let visible = false;
  return { visible: () => visible,
  backButton: { show: { ifAvailable: vi.fn(() => { visible = true; }) }, hide: { ifAvailable: vi.fn(() => { visible = false; }) }, onClick: { ifAvailable: vi.fn((_handler: () => void) => ({ ok: true, data: () => {} })) } },
  mainButton: { setParams: { isAvailable: vi.fn(() => false), ifAvailable: vi.fn() }, onClick: { ifAvailable: vi.fn((_handler: () => void) => ({ ok: true, data: () => {} })) } },
  miniApp: { ready: { ifAvailable: vi.fn() } },
}; });
vi.mock('@tma.js/sdk-react', () => sdk);
const signedIn = { 'POST /api/auth/telegram-mini-app': () => json({ token: 'fixture', expiresAt: '2026-11-06T00:00:00Z', user: user() }), 'GET /api/today': () => json(STARTER) };
const launch = { initDataRaw: 'fixture', languageCode: 'ru' };
const back = () => sdk.backButton.onClick.ifAvailable.mock.calls.at(-1)?.[0]();

test('Telegram «назад» закрывает темы, затем конструктор, затем сессию', async () => {
  fakeServer({ ...signedIn, 'GET /api/trainings/options': () => json(trainingOptions()), 'POST /api/trainings': () => json(trainingSession()) });
  const { screen } = await renderApp({ path: '/training/new', shell: 'telegram', launch });
  await expect.element(screen.getByRole('textbox', { name: 'Вопросов' })).toBeVisible();
  await expect.poll(() => sdk.visible()).toBe(true);
  await screen.getByRole('button', { name: 'Темы и сложность все' }).click(); back();
  await expect.element(screen.getByRole('heading', { name: 'Новая тренировка' })).toBeVisible();
  await screen.getByRole('button', { name: /Начать ·/ }).click(); await expect.element(screen.getByRole('heading', { name: 'Продолжить тренировку' })).toBeVisible(); back();
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  await screen.getByRole('link', { name: 'Своя тренировка' }).click(); await expect.element(screen.getByRole('heading', { name: 'Новая тренировка' })).toBeVisible(); back();
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
});
test('Telegram «назад» во время загрузки возвращает на «Сегодня»', async () => {
  let release: () => void = () => {}; const held = new Promise<void>((r) => { release = r; });
  fakeServer({ ...signedIn, 'GET /api/trainings/options': async () => { await held; return json(trainingOptions()); } });
  const { screen } = await renderApp({ path: '/training/new', shell: 'telegram', launch });
  await expect.element(screen.getByText('Загружаем темы')).toBeVisible(); back(); release();
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
});


test('два сигнала MainButton в одном кадре создают одну тренировку', async () => {
  let release: () => void = () => {}; const held = new Promise<void>((r) => { release = r; });
  const server = fakeServer({ ...signedIn, 'GET /api/trainings/options': () => json(trainingOptions()),
    'POST /api/trainings': async () => { await held; return json(trainingSession()); } });
  sdk.mainButton.setParams.isAvailable.mockReturnValue(true);
  const { screen } = await renderApp({ path: '/training/new', shell: 'telegram', launch });
  try {
    await expect.element(screen.getByRole('textbox', { name: 'Вопросов' })).toBeVisible();
    const click = sdk.mainButton.onClick.ifAvailable.mock.calls.at(-1)?.[0];
    expect(click).toBeDefined(); click?.(); click?.();
    await expect.poll(() => server.requests.filter((r) => r.method === 'POST' && new URL(r.url).pathname === '/api/trainings').length).toBe(1);
    release(); await expect.element(screen.getByRole('heading', { name: 'Продолжить тренировку' })).toBeVisible();
  } finally { release(); sdk.mainButton.setParams.isAvailable.mockReturnValue(false); }
});
