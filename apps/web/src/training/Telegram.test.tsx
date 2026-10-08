import { expect, test, vi } from 'vitest';
import { fakeServer, json, renderApp, STARTER, user } from '../test/app';
import { trainingOptions, trainingSession } from '../test/training';

const sdk = vi.hoisted(() => {
  let visible = false;
  return { visible: () => visible,
  backButton: { show: { ifAvailable: vi.fn(() => { visible = true; }) }, hide: { ifAvailable: vi.fn(() => { visible = false; }) }, onClick: { ifAvailable: vi.fn((_handler: () => void) => ({ ok: true, data: () => {} })) } },
  mainButton: { setParams: { isAvailable: vi.fn(() => false), ifAvailable: vi.fn() }, onClick: { ifAvailable: vi.fn((_handler: () => void) => ({ ok: true, data: () => {} })) } },
  secondaryButton: { setParams: { isAvailable: vi.fn(() => false), ifAvailable: vi.fn() }, onClick: { ifAvailable: vi.fn(() => ({ ok: true, data: () => {} })) } },
  closingBehavior: { mount: { ifAvailable: vi.fn() }, isConfirmationEnabled: vi.fn(() => false), enableConfirmation: { isAvailable: vi.fn(() => false), ifAvailable: vi.fn() }, disableConfirmation: { ifAvailable: vi.fn() } },
  swipeBehavior: { disableVertical: { isAvailable: vi.fn(() => true), ifAvailable: vi.fn() }, enableVertical: { ifAvailable: vi.fn() }, isVerticalEnabled: vi.fn(() => true) },
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
  await screen.getByRole('button', { name: /Начать ·/ }).click(); await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible(); back();
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
    release(); await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
  } finally { release(); sdk.mainButton.setParams.isAvailable.mockReturnValue(false); }
});

for (const enabled of [true, false]) test(`сессия сохраняет прогресс на «назад», свайпы восстановлены: ${enabled}`, async () => {
  sdk.swipeBehavior.isVerticalEnabled.mockReturnValue(enabled);
  vi.clearAllMocks();
  fakeServer({ ...signedIn, 'GET /api/trainings/options': () => json(trainingOptions()), 'POST /api/trainings': () => json(trainingSession()) });
  const { screen } = await renderApp({ path: '/training/new', shell: 'telegram', launch });
  await screen.getByRole('button', { name: /Начать ·/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
  expect(sdk.swipeBehavior.disableVertical.ifAvailable).toHaveBeenCalled();
  back(); await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  expect(sdk.swipeBehavior.enableVertical.ifAvailable.mock.calls.length > 0).toBe(enabled);
  await expect.element(screen.getByRole('link', { name: /Продолжить тренировку/ })).toBeVisible();
});

test('после перезагрузки отключённые сессией свайпы возвращаются к исходному состоянию', async () => {
  // При выгрузке страницы React не вызывает cleanup; SDK восстанавливает выключенные свайпы.
  sessionStorage.setItem('greprep.training.swipes', 'enabled');
  sdk.swipeBehavior.isVerticalEnabled.mockReturnValue(false);
  vi.clearAllMocks();
  fakeServer({ ...signedIn, 'GET /api/trainings/options': () => json(trainingOptions()), 'POST /api/trainings': () => json(trainingSession()) });
  const { screen } = await renderApp({ path: '/training/new', shell: 'telegram', launch });
  await screen.getByRole('button', { name: /Начать ·/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
  back(); await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  expect(sdk.swipeBehavior.enableVertical.ifAvailable).toHaveBeenCalled();
  expect(sessionStorage.getItem('greprep.training.swipes')).toBeNull();
});

for (const stored of ['disabled', 'broken', 'storage-failed', 'cleanup-failed', 'unsupported']) test(`свайпы: исходное состояние и отказы оболочки ${stored}`, async () => {
  sdk.swipeBehavior.isVerticalEnabled.mockReturnValue(true);
  sdk.swipeBehavior.disableVertical.isAvailable.mockReturnValue(stored !== 'unsupported');
  sessionStorage.setItem('greprep.training.swipes', stored === 'disabled' ? 'disabled' : 'broken');
  if (stored === 'storage-failed') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('fixture denied'); });
  vi.clearAllMocks();
  fakeServer({ ...signedIn, 'GET /api/trainings/options': () => json(trainingOptions()), 'POST /api/trainings': () => json(trainingSession()) });
  const { screen } = await renderApp({ path: '/training/new', shell: 'telegram', launch });
  await screen.getByRole('button', { name: /Начать ·/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Text Completion' })).toBeVisible();
  if (stored === 'cleanup-failed') vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('fixture denied'); });
  back(); await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  expect(sdk.swipeBehavior.enableVertical.ifAvailable.mock.calls.length > 0).toBe(stored !== 'disabled' && stored !== 'unsupported');
  sdk.swipeBehavior.disableVertical.isAvailable.mockReturnValue(true);
});


test('свайпы выключены в конструкторе, итоге, разборе и жалобе, при выходе восстановлены', async () => {
  sdk.swipeBehavior.isVerticalEnabled.mockReturnValue(true); vi.clearAllMocks();
  fakeServer({ ...signedIn, 'GET /api/trainings/options': () => json(trainingOptions()), 'POST /api/trainings': () => json(trainingSession()) });
  const { trainingRepository } = await import('./repository');
  vi.spyOn(trainingRepository, 'requestSync').mockImplementation(() => {});
  const { screen } = await renderApp({ path: '/training/new', shell: 'telegram', launch });
  await expect.element(screen.getByRole('heading', { name: 'Новая тренировка' })).toBeVisible();
  expect(sdk.swipeBehavior.disableVertical.ifAvailable).toHaveBeenCalled();
  await screen.getByRole('button', { name: /Начать ·/ }).click();
  for (let index = 0; index < 3; index++) {
    await screen.getByRole('button', { name: 'Не знаю', exact: true }).click();
    await screen.getByRole('button', { name: index < 2 ? /Дальше ·/ : 'Итог', exact: true }).click();
  }
  await screen.getByRole('link', { name: 'Все ответы и разборы' }).click();
  await screen.getByRole('link', { name: /Вопрос 1, без ответа/ }).click();
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toBeVisible();
  expect(sdk.swipeBehavior.enableVertical.ifAvailable).not.toHaveBeenCalled();
  for (const heading of ['Вопрос 1', 'Разбор тренировки', '0 из 3 верно']) { back(); await expect.element(screen.getByRole('heading', { name: heading, exact: true })).toBeVisible(); }
  await screen.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  expect(sdk.swipeBehavior.enableVertical.ifAvailable).toHaveBeenCalledTimes(1);
});


for (const originallyEnabled of [true, false]) test(`черновик Telegram защищён до записи и возвращает подтверждение закрытия: ${originallyEnabled}`, async () => {
  sdk.closingBehavior.enableConfirmation.isAvailable.mockReturnValue(true);
  sdk.closingBehavior.isConfirmationEnabled.mockReturnValue(originallyEnabled);
  fakeServer({ ...signedIn, 'GET /api/trainings/options': () => json(trainingOptions()), 'POST /api/trainings': () => json(trainingSession()) });
  const { trainingRepository } = await import('./repository'); vi.spyOn(trainingRepository, 'requestSync').mockImplementation(() => {});
  const { screen } = await renderApp({ path: '/training/new', shell: 'telegram', launch });
  await screen.getByRole('button', { name: /Начать ·/ }).click();
  await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
  let release = () => {}; const held = new Promise<void>((resolve) => { release = resolve; });
  const original = trainingRepository.store.update.bind(trainingRepository.store);
  vi.spyOn(trainingRepository.store, 'update').mockImplementationOnce(async (...args) => { await held; return original(...args); });
  sdk.closingBehavior.disableConfirmation.ifAvailable.mockClear(); sdk.closingBehavior.enableConfirmation.ifAvailable.mockClear();
  try {
    await screen.getByRole('button', { name: 'Другое', exact: true }).click();
    expect(sdk.closingBehavior.enableConfirmation.ifAvailable).toHaveBeenCalled();
    release(); await expect.element(screen.getByText('Черновик сохранён', { exact: true })).toBeInTheDocument();
    expect(sdk.closingBehavior.disableConfirmation.ifAvailable.mock.calls.length > 0).toBe(!originallyEnabled);
  } finally { release(); sdk.closingBehavior.enableConfirmation.isAvailable.mockReturnValue(false); }
});


test('перезагрузка формы возвращает исходное подтверждение закрытия Telegram', async () => {
  sessionStorage.setItem('greprep.training.draft-close', 'disabled');
  sdk.closingBehavior.enableConfirmation.isAvailable.mockReturnValue(true);
  sdk.closingBehavior.isConfirmationEnabled.mockReturnValue(true);
  sdk.closingBehavior.disableConfirmation.ifAvailable.mockClear();
  fakeServer({ ...signedIn, 'GET /api/trainings/options': () => json(trainingOptions()), 'POST /api/trainings': () => json(trainingSession()) });
  const { trainingRepository } = await import('./repository'); vi.spyOn(trainingRepository, 'requestSync').mockImplementation(() => {});
  const { screen } = await renderApp({ path: '/training/new', shell: 'telegram', launch });
  try {
    await screen.getByRole('button', { name: /Начать ·/ }).click();
    await screen.getByRole('link', { name: 'Сообщить об ошибке' }).click();
    await expect.element(screen.getByRole('textbox', { name: 'Что не так' })).toBeVisible();
    expect(sdk.closingBehavior.disableConfirmation.ifAvailable).toHaveBeenCalled();
    expect(sessionStorage.getItem('greprep.training.draft-close')).toBeNull();
  } finally { sdk.closingBehavior.enableConfirmation.isAvailable.mockReturnValue(false); }
});
