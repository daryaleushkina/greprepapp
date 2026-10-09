import { afterEach, expect, test, vi } from 'vitest';
import { ReportDraftWriter } from './reportDraftWriter';

afterEach(() => { vi.useRealTimers(); });
const held = () => { let resolve = () => {}; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };

test('200 быстрых изменений записываются один раз, сразу — при flush', async () => {
  vi.useFakeTimers();
  const save = vi.fn(async () => {}), changed = vi.fn();
  const writer = new ReportDraftWriter(save, changed, vi.fn());
  for (let i = 1; i <= 200; i++) { writer.change({ text: 'a'.repeat(i) }); await vi.advanceTimersByTimeAsync(5); }
  expect(save).not.toHaveBeenCalled();
  await writer.flush();
  expect(save).toHaveBeenCalledExactlyOnceWith({ text: 'a'.repeat(200) });
  expect(changed).toHaveBeenLastCalledWith(false);
  await writer.flush(); expect(save).toHaveBeenCalledTimes(1);
});

test('пока запись в полёте, новые изменения объединяются; после неё пишет только последнее', async () => {
  vi.useFakeTimers(); const gate = held();
  const save = vi.fn(async () => {}).mockImplementationOnce(() => gate.promise);
  const writer = new ReportDraftWriter(save, vi.fn(), vi.fn());
  writer.change({ kind: 'other' }); const flushed = writer.flush();
  for (let i = 1; i <= 200; i++) writer.change({ kind: 'other', text: 'a'.repeat(i) });
  const secondFlush = writer.flush(); expect(save).toHaveBeenCalledTimes(1);
  gate.resolve(); await Promise.all([flushed, secondFlush]);
  expect(save).toHaveBeenCalledTimes(2); expect(save).toHaveBeenLastCalledWith({ kind: 'other', text: 'a'.repeat(200) });
});

test('без flush запись запускается после завершения ввода', async () => {
  vi.useFakeTimers(); const save = vi.fn(async () => {});
  const writer = new ReportDraftWriter(save, vi.fn(), vi.fn());
  writer.change({ text: 'Synthetic' }); await vi.runAllTimersAsync();
  expect(save).toHaveBeenCalledExactlyOnceWith({ text: 'Synthetic' });
});

test('сбой приостанавливает запись, ввод не размножает отчёты; явный повтор сохраняет последнюю версию', async () => {
  vi.useFakeTimers(); const error = new DOMException('Synthetic', 'QuotaExceededError');
  const failed = vi.fn(), save = vi.fn(async () => {}).mockRejectedValueOnce(error);
  const writer = new ReportDraftWriter(save, vi.fn(), failed);
  writer.change({ text: 'first' }); await writer.flush();
  for (let i = 0; i < 200; i++) writer.change({ text: 'last' });
  await vi.runAllTimersAsync(); await writer.flush();
  expect(save).toHaveBeenCalledTimes(1); expect(failed).toHaveBeenCalledExactlyOnceWith(error);
  await writer.flush(true); expect(save).toHaveBeenLastCalledWith({ text: 'last' });
});

test('отмена ждёт текущую запись и не возвращает черновик после очистки', async () => {
  vi.useFakeTimers(); const gate = held(), save = vi.fn(() => gate.promise);
  const writer = new ReportDraftWriter(save, vi.fn(), vi.fn());
  writer.change({ text: 'first' }); const flushing = writer.flush(); writer.change({ text: 'last' });
  const discarded = writer.discard(); writer.change({ text: 'too late' });
  gate.resolve(); await Promise.all([flushing, discarded]); await writer.flush();
  expect(save).toHaveBeenCalledTimes(1);
});

test('отмена до запуска не пишет на диск', async () => {
  vi.useFakeTimers(); const save = vi.fn(async () => {});
  const writer = new ReportDraftWriter(save, vi.fn(), vi.fn());
  writer.change({ text: 'Synthetic' }); await writer.discard(); await vi.runAllTimersAsync(); await writer.flush();
  expect(save).not.toHaveBeenCalled();
});
