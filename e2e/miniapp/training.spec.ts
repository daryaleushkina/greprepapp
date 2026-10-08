import { expect, test } from '../fixtures';
import { buildAndResume, offlineBuilder, presetMatchesForm, resumeCounterStaysTogether, unavailableStorageKeepsSession } from '../training';

test('собрать, начать и продолжить после возврата и перезагрузки', async ({ miniApp }) => { await buildAndResume(miniApp); });
test('без сети конструктор не начинает, после возвращения сети начинает', async ({ miniApp }) => { await offlineBuilder(miniApp); });
test('проверка на время показывает в форме параметры запуска', async ({ miniApp }) => { await presetMatchesForm(miniApp); });
test('«вопрос 1 из 10» переносится целиком', async ({ miniApp }) => { await resumeCounterStaysTogether(miniApp); });
test('недоступное хранилище отключает тренировки, но сохраняет вход и остальное приложение', async ({ miniApp }) => { await unavailableStorageKeepsSession(miniApp); });

import { practiceThroughSummary, checkWithReturn, partialCheckAnswer, timeRunsOut, reloadSession, offlineSession, startSession, nativeButtonsFit } from '../training';
test('практика целиком: верный, неверный, RU/EN, «Не знаю», итог и повтор', async ({ miniApp: page }) => { await practiceThroughSummary(page); });
test('проверка: пропустить, отметить, вернуться из списка и закончить', async ({ miniApp: page }) => { await checkWithReturn(page); });
test('проверка: частичный TC3 не отвечен, выбор сохраняется после перезагрузки', async ({ miniApp: page }) => { await partialCheckAnswer(page); });
test('время вышло на открытом экране', async ({ miniApp: page }) => { await timeRunsOut(page); });
test('время вышло после закрытия экрана', async ({ miniApp: page }) => { await timeRunsOut(page, true); });
test('перезагрузка сохраняет вопрос, выбор и раскрытый разбор', async ({ miniApp: page }) => { await reloadSession(page); });
test('без сети ответы и итог локальны, после возвращения сети сервер видит всё', async ({ miniApp: page, me }) => { await offlineSession(page, me); });

test('родные кнопки: одна назад и подписи в одну строку на вопросе и итоге', async ({ miniApp: page }) => {
  await startSession(page);
  await expect(page.locator('#tg-mock-back')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Закрыть тренировку' })).toHaveCount(0);
  await nativeButtonsFit(page);
  for (let position = 0; position < 3; position++) {
    await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
    await nativeButtonsFit(page);
    await page.getByRole('button', { name: position < 2 ? new RegExp(`Дальше · ${position + 2} из`) : 'Итог', exact: position === 2 }).click();
  }
  await expect(page.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Готово', exact: true })).toHaveCount(0);
  await nativeButtonsFit(page);
});

test('me мини-аппа не создаёт лишнюю страницу', async ({ me, context }) => {
  await me.api('GET', '/me');
  expect(context.pages()).toHaveLength(0);
});

test('итог: пара нижних подписей не переносится', async ({ miniApp: page }) => {
  await startSession(page);
  for (let position = 0; position < 3; position++) {
    await page.getByRole('button', { name: 'Не знаю', exact: true }).click();
    await page.getByRole('button', { name: position < 2 ? new RegExp(`Дальше · ${position + 2} из`) : 'Итог', exact: position === 2 }).click();
  }
  await expect(page.getByRole('heading', { name: '0 из 3 верно' })).toBeVisible();
  await nativeButtonsFit(page);
  await expect(page.locator('#tg-mock-bar')).toHaveCSS('flex-direction', 'column-reverse');
});

import { reviewAllAnswers, reportFromQuestionAndReview } from '../training';
test('все ответы из итога: фильтр, разбор RU/EN и назад', async ({ miniApp: page }) => { await reviewAllAnswers(page); });
test('жалобы с вопроса и из разбора записаны сервером', async ({ miniApp: page, me }) => { await reportFromQuestionAndReview(page, me); });
test('жалоба без сети отправляется после возвращения сети', async ({ miniApp: page, me }) => { await reportFromQuestionAndReview(page, me, true); });

import { reportDraftAndLimit } from '../training';
test('черновик жалобы после перезагрузки, лимит вставки и отмена', async ({ miniApp: page }) => { await reportDraftAndLimit(page); });
