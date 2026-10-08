import { test } from '../fixtures';
import { buildAndResume, offlineBuilder, presetMatchesForm, resumeCounterStaysTogether, unavailableStorageKeepsSession } from '../training';

test('собрать, начать и продолжить после возврата и перезагрузки', async ({ site }) => { await buildAndResume(site); });
test('без сети конструктор не начинает, после возвращения сети начинает', async ({ site }) => { await offlineBuilder(site); });
test('проверка на время показывает в форме параметры запуска', async ({ site }) => { await presetMatchesForm(site); });
test('«вопрос 1 из 10» переносится целиком', async ({ site }) => { await resumeCounterStaysTogether(site); });
test('недоступное хранилище отключает тренировки, но сохраняет вход и остальное приложение', async ({ site }) => { await unavailableStorageKeepsSession(site); });
