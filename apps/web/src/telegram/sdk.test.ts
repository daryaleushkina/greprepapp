import { beforeEach, describe, expect, it, vi } from 'vitest';

// SDK Telegram подменён: проверяется наш порядок запуска и три исхода, а не сам @tma.js.
const sdk = vi.hoisted(() => {
  const avail = <T extends (...a: never[]) => unknown>(fn: T, available = true) =>
    Object.assign(vi.fn(fn), { isAvailable: vi.fn(() => available), ifAvailable: vi.fn() });
  return {
    init: vi.fn(),
    themeParams: { mount: vi.fn(), bindCssVars: vi.fn(), isDark: Object.assign(vi.fn(() => false), { sub: vi.fn(() => () => {}) }) },
    miniApp: {
      mount: vi.fn(),
      bindCssVars: vi.fn(),
      setHeaderColor: { ifAvailable: vi.fn() },
      setBgColor: { ifAvailable: vi.fn() },
      setBottomBarColor: { ifAvailable: vi.fn() },
    },
    initData: { restore: vi.fn(), raw: vi.fn((): string | undefined => 'query_id=1&hash=x'), user: vi.fn(() => ({ language_code: 'en' })) },
    mainButton: { mount: { ifAvailable: vi.fn() } },
    backButton: { mount: { ifAvailable: vi.fn() } },
    viewport: {
      mount: avail(async (_o?: unknown) => {}),
      bindCssVars: vi.fn(),
      expand: { ifAvailable: vi.fn() },
      requestFullscreen: avail(async () => {}),
      isFullscreen: vi.fn(() => false),
    },
    retrieveLaunchParams: vi.fn(() => ({ tgWebAppPlatform: 'ios' })),
  };
});
vi.mock('@tma.js/sdk-react', () => sdk);
vi.mock('./mockEnv', () => ({ mockTelegramEnvForDev: vi.fn(async () => {}) }));

import { followTelegramTheme, startTelegram } from './sdk';

function environment(opts: { hash?: string; storage?: Record<string, string>; storageThrows?: boolean } = {}) {
  vi.stubGlobal('location', { hash: opts.hash ?? '' });
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => {
      if (opts.storageThrows) throw new DOMException('denied', 'SecurityError');
      return opts.storage?.[k] ?? null;
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  sdk.init.mockImplementation(() => {});
  sdk.initData.raw.mockImplementation(() => 'query_id=1&hash=x');
  sdk.viewport.mount.mockImplementation(async () => {});
  sdk.viewport.requestFullscreen.mockImplementation(async () => {});
  sdk.viewport.requestFullscreen.isAvailable.mockReturnValue(true);
  sdk.viewport.isFullscreen.mockReturnValue(false);
  sdk.retrieveLaunchParams.mockImplementation(() => ({ tgWebAppPlatform: 'ios' }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('startTelegram', () => {
  it('запуск из Telegram: параметры, язык; на телефоне — полноэкранный режим', async () => {
    environment({ hash: '#tgWebAppData=x' });
    expect(await startTelegram()).toEqual({ kind: 'ok', launch: { initDataRaw: 'query_id=1&hash=x', languageCode: 'en' } });
    expect(sdk.themeParams.mount).toHaveBeenCalled();
    expect(sdk.viewport.bindCssVars).toHaveBeenCalled();
    expect(sdk.viewport.requestFullscreen).toHaveBeenCalled();
  });

  it.each([
    ['tdesktop', false],
    ['android', true],
    ['macos', false],
  ])('платформа %s — полноэкранный режим: %s', async (platform, wanted) => {
    environment();
    sdk.retrieveLaunchParams.mockImplementation(() => ({ tgWebAppPlatform: platform }));
    await startTelegram();
    expect(sdk.viewport.requestFullscreen.mock.calls.length > 0).toBe(wanted);
  });

  it('уже полноэкранный, клиент не умеет или отказал — остаёмся как есть, запуск не падает', async () => {
    environment();
    sdk.viewport.isFullscreen.mockReturnValue(true);
    expect((await startTelegram()).kind).toBe('ok');
    expect(sdk.viewport.requestFullscreen).not.toHaveBeenCalled();
    sdk.viewport.isFullscreen.mockReturnValue(false);
    sdk.viewport.requestFullscreen.mockImplementation(async () => {
      throw new Error('UNSUPPORTED');
    });
    expect((await startTelegram()).kind).toBe('ok');
    sdk.retrieveLaunchParams.mockImplementation(() => {
      throw new Error('no launch params');
    });
    expect((await startTelegram()).kind).toBe('ok');
  });

  it('клиент не ответил про размеры — живём на запасных значениях, запуск не падает', async () => {
    environment();
    sdk.viewport.mount.mockImplementation(async () => {
      throw new Error('timeout');
    });
    expect((await startTelegram()).kind).toBe('ok');
    expect(sdk.viewport.bindCssVars).not.toHaveBeenCalled();
  });

  it('SDK не принял параметры, а запустил Telegram (фрагмент адреса) — сбой, а не уход на сайт', async () => {
    environment({ hash: '#tgWebAppData=broken' });
    sdk.init.mockImplementation(() => {
      throw new Error('InvalidLaunchParamsError');
    });
    expect(await startTelegram()).toMatchObject({ kind: 'failed' });
  });

  it('то же после перезагрузки (параметры сохранены SDK) — сбой', async () => {
    environment({ storage: { 'tapps/launchParams': 'x' } });
    sdk.init.mockImplementation(() => {
      throw new Error('InvalidLaunchParamsError');
    });
    expect(await startTelegram()).toMatchObject({ kind: 'failed' });
  });

  it('/tg/ открыли в обычном браузере — это не Telegram (и при запрете хранилища тоже)', async () => {
    sdk.init.mockImplementation(() => {
      throw new Error('UnknownEnvError');
    });
    environment();
    expect(await startTelegram()).toEqual({ kind: 'not-telegram' });
    environment({ storageThrows: true });
    expect(await startTelegram()).toEqual({ kind: 'not-telegram' });
  });

  it('Telegram запустил без initData — сбой', async () => {
    environment();
    sdk.initData.raw.mockImplementation(() => undefined);
    expect(await startTelegram()).toMatchObject({ kind: 'failed' });
  });
});

describe('followTelegramTheme', () => {
  it('тема — по Telegram; шапке, фону и нижней панели — наш фон из токенов; подписка на смену', () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset } });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ' #0E0F14 ' }));
    sdk.themeParams.isDark.mockReturnValue(true);
    followTelegramTheme();
    expect(dataset.theme).toBe('dark');
    expect(sdk.miniApp.setHeaderColor.ifAvailable).toHaveBeenCalledWith('#0E0F14');
    expect(sdk.miniApp.setBgColor.ifAvailable).toHaveBeenCalledWith('#0E0F14');
    expect(sdk.miniApp.setBottomBarColor.ifAvailable).toHaveBeenCalledWith('#0E0F14');
    expect(sdk.themeParams.isDark.sub).toHaveBeenCalled();
  });

  it('фон не в hex (токены ещё не загрузились) — цвета клиенту не трогаем', () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset } });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
    sdk.themeParams.isDark.mockReturnValue(false);
    followTelegramTheme();
    expect(dataset.theme).toBe('light');
    expect(sdk.miniApp.setHeaderColor.ifAvailable).not.toHaveBeenCalled();
  });
});
