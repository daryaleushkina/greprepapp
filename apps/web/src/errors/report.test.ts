import { beforeEach, describe, expect, it, vi } from 'vitest';

const reportClientError = vi.fn(async (_body: unknown) => undefined);
vi.mock('@greprep/api-client', () => ({ reportClientError, lastSeenRequestId: () => 'req-7' }));

beforeEach(() => {
  vi.resetModules();
  reportClientError.mockClear();
  vi.stubGlobal('location', { pathname: '/step/x' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function load() {
  return import('./report');
}

describe('reportError', () => {
  it('отчёт по договору: текст, стек, путь без параметров, id запроса, вид клиента, версия, время', async () => {
    const { configureReporter, reportError } = await load();
    configureReporter('telegram');
    reportError(new TypeError('boom'));
    expect(reportClientError).toHaveBeenCalledWith({
      message: 'TypeError: boom',
      stack: expect.stringContaining('boom'),
      route: '/step/x',
      requestId: 'req-7',
      clientKind: 'telegram',
      appVersion: expect.any(String),
      occurredAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
  });

  it('не Error — тоже отчёт; та же ошибка подряд — один раз', async () => {
    const { reportError } = await load();
    reportError('plain string');
    reportError('plain string');
    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError.mock.calls[0]?.[0]).toMatchObject({ message: 'Error: plain string', clientKind: 'web' });
  });

  it('не больше 20 отчётов со страницы', async () => {
    const { reportError } = await load();
    for (let i = 0; i < 30; i++) reportError(new Error(`e${i}`));
    expect(reportClientError).toHaveBeenCalledTimes(20);
  });

  it('отчёт не дошёл — только предупреждение в консоли', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reportClientError.mockRejectedValueOnce(new Error('offline'));
    const { reportError } = await load();
    reportError(new Error('x'));
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
  });

  it('глобальные обработчики ловят ошибки и отклонённые промисы', async () => {
    const listeners = new Map<string, (e: unknown) => void>();
    vi.stubGlobal('window', { addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn) });
    const { installGlobalReporter } = await load();
    installGlobalReporter();
    listeners.get('error')?.({ error: new Error('uncaught'), message: 'uncaught' });
    listeners.get('error')?.({ error: null, message: 'Script error.' });
    listeners.get('unhandledrejection')?.({ reason: new Error('rejected') });
    expect(reportClientError.mock.calls.map((c) => (c[0] as { message: string }).message)).toEqual([
      'Error: uncaught',
      'Error: Script error.',
      'Error: rejected',
    ]);
  });
});
