// Маршруты. Одно дерево на обе оболочки: мини-апп живёт под /tg (basepath), сайт — в корне.
//   /                 «Сегодня»          (вкладка)
//   /words /exam /progress               (вкладки; пока заглушки до своих фич)
//   /settings         настройки          (на компьютере — пункт панели, на телефоне — экран из «Прогресса»)
//   /step/$stepId     шаг из ленты       (пока заглушка; тренировки — ROADMAP §5)
//   /training/new     конструктор        (ленивый маршрут)
//   /training/$trainingId локальная сессия и итог
//   /signin           вход               (только сайт)
//   /auth/callback    возврат от провайдера входа (только сайт)
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, Outlet, type RouterHistory } from '@tanstack/react-router';
import { schemas } from '@greprep/api-client';
import { z } from 'zod';
import { safeReturnTo } from './auth/returnTo';
import { SectionUnavailable } from './errors/SectionUnavailable';
import { loadSections, SectionLoadError } from './sections';
import { Crashed, reportRouteError } from './errors/ErrorBoundary';
import { AppGate, TabsLayout } from './layout/AppLayout';
import { SignInScreen } from './screens/signin/SignInScreen';
import { TodayScreen } from './screens/today/TodayScreen';
import { TELEGRAM_BASE, type Shell } from './shell';

export interface RouterContext {
  queryClient: QueryClient;
  shell: Shell;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet });

/** Почему человек на экране входа: адрес — внешний ввод, поэтому разбор по схеме, неизвестное — пропускаем. */
const signInSearch = z.object({
  reason: z.enum(['expired', 'cancelled', 'failed', 'offline', 'tooMany']).optional().catch(undefined),
  returnTo: z.unknown().transform(safeReturnTo).optional(),
});
export type SignInReason = NonNullable<z.infer<typeof signInSearch>['reason']>;

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'signin',
  validateSearch: signInSearch,
  component: SignInScreen,
});

const callbackRoute = createRoute({ getParentRoute: () => rootRoute, path: 'auth/callback', component: lazyRouteComponent(() => import('./screens/signin/AuthCallback'), 'AuthCallback') });

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppGate });
const tabsRoute = createRoute({ getParentRoute: () => appRoute, id: 'tabs', component: TabsLayout });

const todayRoute = createRoute({ getParentRoute: () => tabsRoute, path: '/', component: TodayScreen });
const wordsRoute = createRoute({ getParentRoute: () => tabsRoute, path: 'words', errorComponent: SectionUnavailable })
  .lazy(() => loadSections().then((m) => m.wordsRoute));
const examRoute = createRoute({ getParentRoute: () => tabsRoute, path: 'exam', errorComponent: SectionUnavailable })
  .lazy(() => loadSections().then((m) => m.examRoute));
const progressRoute = createRoute({ getParentRoute: () => tabsRoute, path: 'progress', errorComponent: SectionUnavailable })
  .lazy(() => loadSections().then((m) => m.progressRoute));
const settingsRoute = createRoute({ getParentRoute: () => tabsRoute, path: 'settings', errorComponent: SectionUnavailable })
  .lazy(() => loadSections().then((m) => m.settingsRoute));
const stepRoute = createRoute({ getParentRoute: () => appRoute, path: 'step/$stepId', errorComponent: SectionUnavailable })
  .lazy(() => loadSections().then((m) => m.stepRoute));

const builderRoute = createRoute({ getParentRoute: () => appRoute, path: 'training/new',
  validateSearch: z.object({ section: z.enum(['verbal', 'quant']).optional().catch(undefined), type: schemas.QuestionType.optional().catch(undefined) }),
}).lazy(() => import('./training/routes.lazy').then((m) => m.builderRoute));
const trainingRoute = createRoute({ getParentRoute: () => appRoute, path: 'training/$trainingId' })
  .lazy(() => import('./training/routes.lazy').then((m) => m.sessionRoute));

const reviewRoute = createRoute({ getParentRoute: () => appRoute, path: 'training/$trainingId/review' })
  .lazy(() => import('./training/routes.lazy').then((m) => m.reviewRoute));
const trainingPosition = z.object({ trainingId: z.string(), position: z.string().regex(/^(0|[1-9]\d*)$/)
  .transform(Number).refine(Number.isSafeInteger).nullable().catch(null) });
const positionParams = { parse: (params: Record<string, string>) => trainingPosition.parse(params), stringify: (params: z.infer<typeof trainingPosition>) => ({ ...params, position: String(params.position) }) };
const reviewItemRoute = createRoute({ getParentRoute: () => appRoute, path: 'training/$trainingId/review/$position', params: positionParams })
  .lazy(() => import('./training/routes.lazy').then((m) => m.reviewItemRoute));
const reportRoute = createRoute({ getParentRoute: () => appRoute, path: 'training/$trainingId/report/$position', params: positionParams,
  validateSearch: z.object({ returnTo: z.enum(['session', 'review']).catch('session').default('session') }),
}).lazy(() => import('./training/routes.lazy').then((m) => m.reportRoute));

const routeTree = rootRoute.addChildren([
  signInRoute,
  callbackRoute,
  appRoute.addChildren([tabsRoute.addChildren([todayRoute, wordsRoute, examRoute, progressRoute, settingsRoute]), stepRoute, builderRoute, trainingRoute, reviewRoute, reviewItemRoute, reportRoute]),
]);

/** history — для тестов (память вместо адресной строки); в приложении — адресная строка браузера. */
export function makeRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    ...(history && { history }),
    basepath: context.shell === 'telegram' ? TELEGRAM_BASE : '/',
    defaultPreload: 'intent',
    // У маршрутизатора свой перехват ошибок экранов — без этих двух ErrorBoundary снаружи их бы не увидел:
    // человек получил бы английскую заглушку, а отчёт не ушёл бы.
    defaultErrorComponent: Crashed,
    defaultOnCatch: (error, info) => {
      // Отсутствие сети — ожидаемый отказ загрузки, падение самого экрана по-прежнему уходит в отчёт.
      if (!(error instanceof SectionLoadError)) reportRouteError(error, info);
    },
    scrollRestoration: true,
    // Вкладки делят один контейнер прокрутки: новая вкладка — сверху, а не с прокруткой прошлой.
    scrollToTopSelectors: ['#main'],
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}
