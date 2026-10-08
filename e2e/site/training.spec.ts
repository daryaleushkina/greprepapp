import { test } from '../fixtures';
import { buildAndResume, offlineBuilder, presetMatchesForm, resumeCounterStaysTogether, unavailableStorageKeepsSession } from '../training';

test('собрать, начать и продолжить после возврата и перезагрузки', async ({ site }) => { await buildAndResume(site); });
test('без сети конструктор не начинает, после возвращения сети начинает', async ({ site }) => { await offlineBuilder(site); });
test('проверка на время показывает в форме параметры запуска', async ({ site }) => { await presetMatchesForm(site); });
test('«вопрос 1 из 10» переносится целиком', async ({ site }) => { await resumeCounterStaysTogether(site); });
test('недоступное хранилище отключает тренировки, но сохраняет вход и остальное приложение', async ({ site }) => { await unavailableStorageKeepsSession(site); });

import { practiceThroughSummary, checkWithReturn, timeRunsOut, reloadSession, offlineSession } from '../training';
test('практика целиком: верный, неверный, RU/EN, «Не знаю», итог и повтор', async ({ site: page }) => { await practiceThroughSummary(page); });
test('проверка: пропустить, отметить, вернуться из списка и закончить', async ({ site: page }) => { await checkWithReturn(page); });
test('время вышло на открытом экране', async ({ site: page }) => { await timeRunsOut(page); });
test('время вышло после закрытия экрана', async ({ site: page }) => { await timeRunsOut(page, true); });
test('перезагрузка сохраняет вопрос, выбор и раскрытый разбор', async ({ site: page }) => { await reloadSession(page); });
test('без сети ответы и итог локальны, после возвращения сети сервер видит всё', async ({ site: page, me }) => { await offlineSession(page, me); });
import { keyboardSession } from '../training';
test('клавиши выбора, Enter и стрелки', async ({ site }) => { await keyboardSession(site); });
