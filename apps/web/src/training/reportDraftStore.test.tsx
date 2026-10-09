import { expect, test, vi } from 'vitest';
import { REPORT_TEXT_MAX } from './model';
import { ReportDraftStore } from './reportDraftStore';

test('перезапуск помнит черновик, ключ разделяет людей, тренировки, позиции и пространства', () => {
  const name = `draft-test-${crypto.randomUUID()}`, draft = { kind: 'translation' as const, text: 'Synthetic' };
  const store = new ReportDraftStore(name);
  expect(store.put('a/b', 'c/d', 0, draft)).toBe(true);
  expect(new ReportDraftStore(name).get('a/b', 'c/d', 0)).toEqual(draft);
  for (const [userId, id, position] of [['a', 'b/c/d', 0], ['a/b', 'c/d', 1], ['a/b', 'other', 0]] as const) {
    expect(store.get(userId, id, position)).toBeUndefined();
  }
  expect(new ReportDraftStore(`${name}-other`).get('a/b', 'c/d', 0)).toBeUndefined();
  store.put('a/b', 'c/d', 0, { text: '' }); expect(store.get('a/b', 'c/d', 0)).toBeUndefined();
});

for (const raw of ['broken JSON', 'null', '{}', '{"text":""}', '{"kind":"invalid"}', '{"text":1}', '{"extra":true}', JSON.stringify({ text: 'a'.repeat(REPORT_TEXT_MAX + 1) })]) {
  test(`испорченное значение удаляется при чтении: ${raw.slice(0, 25)}`, () => {
    const store = new ReportDraftStore('draft-test'), key = 'draft-test/report-draft/a/id/0';
    localStorage.setItem(key, raw);
    expect(store.get('a', 'id', 0)).toBeUndefined(); expect(localStorage.getItem(key)).toBeNull();
  });
}

test('пустой черновик не записывается; уборка и выход работают только по точному префиксу', () => {
  const store = new ReportDraftStore('draft-test');
  localStorage.setItem('other/key', 'keep');
  store.put('a', 'old', 0, { text: 'Synthetic' }); store.put('a', 'old', 1, { kind: 'other' });
  store.put('a', 'current', 0, { text: 'Synthetic current' }); store.put('aa', 'old', 0, { text: 'Synthetic other' });
  store.put('a', 'empty', 0, {}); expect(localStorage.getItem('draft-test/report-draft/a/empty/0')).toBeNull();
  localStorage.setItem('draft-test/report-draft/a/', '{}');
  store.prune('a', ['current']);
  expect(store.get('a', 'old', 0)).toBeUndefined(); expect(store.get('a', 'old', 1)).toBeUndefined();
  expect(store.get('a', 'current', 0)).toEqual({ text: 'Synthetic current' });
  expect(store.get('aa', 'old', 0)).toEqual({ text: 'Synthetic other' });
  store.clear('a'); expect(store.get('a', 'current', 0)).toBeUndefined();
  expect(localStorage.getItem('other/key')).toBe('keep'); expect(store.get('aa', 'old', 0)).toEqual({ text: 'Synthetic other' });
});

test('недоступен сам localStorage: все операции безопасны и отчёт без текста один за сессию', () => {
  const report = vi.fn();
  const store = new ReportDraftStore('draft-test', report, () => { throw new Error('Synthetic private text'); });
  expect(store.put('a', 'id', 0, { text: 'Synthetic' })).toBe(false); expect(store.get('a', 'id', 0)).toBeUndefined();
  store.clear('a'); store.prune('a', []); store.put('a', 'id', 0);
  expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'training report draft storage unavailable' }));
});

test('после единичного переполнения следующее изменение сохраняется', () => {
  const report = vi.fn(), store = new ReportDraftStore('draft-test', report);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new DOMException('Synthetic', 'QuotaExceededError'); });
  expect(store.put('a', 'id', 0, { text: 'Synthetic first' })).toBe(false);
  expect(store.put('a', 'id', 0, { text: 'Synthetic last' })).toBe(true);
  expect(store.get('a', 'id', 0)).toEqual({ text: 'Synthetic last' }); expect(report).toHaveBeenCalledTimes(1);
});

test('черновик, не прошедший схему, не сохраняется и не бросает', () => {
  const store = new ReportDraftStore(`draft-test-${crypto.randomUUID()}`);
  expect(store.put('a', 'id', 0, { text: 'a'.repeat(REPORT_TEXT_MAX + 1) })).toBe(false);
  expect(store.get('a', 'id', 0)).toBeUndefined();
});
