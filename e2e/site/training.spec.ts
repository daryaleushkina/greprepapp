import { expect, test } from '../fixtures';
import { schemas } from '../../packages/api-client/src';
import { buildAndResume, offlineBuilder, presetMatchesForm, resumeCounterStaysTogether, unavailableStorageKeepsSession } from '../training';

test('собрать, начать и продолжить после возврата и перезагрузки', async ({ site }) => { await buildAndResume(site); });
test('без сети конструктор не начинает, после возвращения сети начинает', async ({ site }) => { await offlineBuilder(site); });
test('проверка на время показывает в форме параметры запуска', async ({ site }) => { await presetMatchesForm(site); });
test('«вопрос 1 из 10» переносится целиком', async ({ site }) => { await resumeCounterStaysTogether(site); });
test('недоступное хранилище отключает тренировки, но сохраняет вход и остальное приложение', async ({ site }) => { await unavailableStorageKeepsSession(site); });

import { practiceThroughSummary, checkWithReturn, partialCheckAnswer, timeRunsOut, reloadSession, offlineSession } from '../training';
test('практика целиком: верный, неверный, RU/EN, «Не знаю», итог и повтор', async ({ site: page }) => { await practiceThroughSummary(page); });
test('проверка: пропустить, отметить, вернуться из списка и закончить', async ({ site: page }) => { await checkWithReturn(page); });
test('проверка: частичный TC3 не отвечен, выбор сохраняется после перезагрузки', async ({ site: page }) => { await partialCheckAnswer(page); });
test('время вышло на открытом экране', async ({ site: page }) => { await timeRunsOut(page); });
test('время вышло после закрытия экрана', async ({ site: page }) => { await timeRunsOut(page, true); });
test('перезагрузка сохраняет вопрос, выбор и раскрытый разбор', async ({ site: page }) => { await reloadSession(page); });
test('без сети ответы и итог локальны, после возвращения сети сервер видит всё', async ({ site: page, me }) => { await offlineSession(page, me); });
import { keyboardSession } from '../training';
test('клавиши выбора, Enter и стрелки', async ({ site }) => { await keyboardSession(site); });

test('me — человек, вошедший на сайте', async ({ me, site }) => {
  await expect(site.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  expect(me.user).toEqual(schemas.User.parse(await me.api('GET', '/me')));
});

test('me без site объясняет отсутствие входа', async ({ me }) => {
  expect(() => me.user).toThrow('site');
  await expect(me.api('GET', '/me')).rejects.toThrow('site');
});

import { reviewAllAnswers, reportFromQuestionAndReview } from '../training';
test('все ответы из итога: фильтр, разбор RU/EN и назад', async ({ site: page }) => { await reviewAllAnswers(page); });
test('жалобы с вопроса и из разбора записаны сервером', async ({ site: page, me }) => { await reportFromQuestionAndReview(page, me); });
test('жалоба без сети отправляется после возвращения сети', async ({ site: page, me }) => { await reportFromQuestionAndReview(page, me, true); });

import { reportDraftAndLimit } from '../training';
test('черновик жалобы после перезагрузки, лимит вставки и отмена', async ({ site: page }) => { await reportDraftAndLimit(page); });

import { reportBackStorageFailure } from '../training';
test('«Назад» уходит при сбое стирания черновика без текста в отчёте', async ({ site: page }) => { await reportBackStorageFailure(page); });

import { reportDraftWritesAndQuota } from '../training';
test('200 синхронных записей; переполнение localStorage, форма работает и один отчёт', async ({ site: page }) => { await reportDraftWritesAndQuota(page); });
