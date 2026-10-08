import { test } from '../fixtures';
import { buildAndResume, offlineBuilder } from '../training';

test('собрать, начать и продолжить после возврата и перезагрузки', async ({ miniApp }) => { await buildAndResume(miniApp); });
test('без сети конструктор не начинает, после возвращения сети начинает', async ({ miniApp }) => { await offlineBuilder(miniApp); });
