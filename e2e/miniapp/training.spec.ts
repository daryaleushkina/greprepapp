import { test } from '../fixtures';
import { buildAndResume, offlineBuilder, presetMatchesForm, resumeCounterStaysTogether, unavailableStorageKeepsSession } from '../training';

test('собрать, начать и продолжить после возврата и перезагрузки', async ({ miniApp }) => { await buildAndResume(miniApp); });
test('без сети конструктор не начинает, после возвращения сети начинает', async ({ miniApp }) => { await offlineBuilder(miniApp); });
test('проверка на время показывает в форме параметры запуска', async ({ miniApp }) => { await presetMatchesForm(miniApp); });
test('«вопрос 1 из 10» переносится целиком', async ({ miniApp }) => { await resumeCounterStaysTogether(miniApp); });
test('недоступное хранилище отключает тренировки, но сохраняет вход и остальное приложение', async ({ miniApp }) => { await unavailableStorageKeepsSession(miniApp); });

import { practiceThroughSummary, checkWithReturn, timeRunsOut, reloadSession, offlineSession } from '../training';
test('практика целиком: верный, неверный, RU/EN, «Не знаю», итог и повтор', async ({ miniApp: page }) => { await practiceThroughSummary(page); });
test('проверка: пропустить, отметить, вернуться из списка и закончить', async ({ miniApp: page }) => { await checkWithReturn(page); });
test('время вышло на открытом экране', async ({ miniApp: page }) => { await timeRunsOut(page); });
test('время вышло после закрытия экрана', async ({ miniApp: page }) => { await timeRunsOut(page, true); });
test('перезагрузка сохраняет вопрос, выбор и раскрытый разбор', async ({ miniApp: page }) => { await reloadSession(page); });
test('без сети ответы и итог локальны, после возвращения сети сервер видит всё', async ({ miniApp: page, me }) => { await offlineSession(page, me); });
