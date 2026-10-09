import { createLazyRoute } from '@tanstack/react-router';
import { BuilderScreen } from './BuilderScreen';
import { SessionScreen } from './SessionScreen';
import { ReviewScreen, ReviewItemScreen } from './ReviewScreens';
import { ReportScreen } from './ReportScreen';

export const builderRoute = createLazyRoute('/app/training/new')({ component: BuilderScreen });
export const sessionRoute = createLazyRoute('/app/training/$trainingId')({ component: SessionScreen });

export const reviewRoute = createLazyRoute('/app/training/$trainingId/review')({ component: ReviewScreen });
export const reviewItemRoute = createLazyRoute('/app/training/$trainingId/review/$position')({ component: ReviewItemScreen });
export const reportRoute = createLazyRoute('/app/training/$trainingId/report/$position')({ component: ReportScreen });
