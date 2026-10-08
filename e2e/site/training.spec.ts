import { test } from '../fixtures';
import { buildAndResume, offlineBuilder } from '../training';

test('собрать, начать и продолжить после возврата и перезагрузки', async ({ site }) => { await buildAndResume(site); });
test('без сети конструктор не начинает, после возвращения сети начинает', async ({ site }) => { await offlineBuilder(site); });
