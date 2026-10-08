import { test } from '../fixtures';
import { buildAndResume, offlineBuilder, presetMatchesForm, resumeCounterStaysTogether, unavailableStorageKeepsSession } from '../training';

test('собрать, начать и продолжить после возврата и перезагрузки', async ({ miniApp }) => { await buildAndResume(miniApp); });
test('без сети конструктор не начинает, после возвращения сети начинает', async ({ miniApp }) => { await offlineBuilder(miniApp); });
test('проверка на время показывает в форме параметры запуска', async ({ miniApp }) => { await presetMatchesForm(miniApp); });
test('«вопрос 1 из 10» переносится целиком', async ({ miniApp }) => { await resumeCounterStaysTogether(miniApp); });
test('недоступное хранилище отключает тренировки, но сохраняет вход и остальное приложение', async ({ miniApp }) => { await unavailableStorageKeepsSession(miniApp); });
