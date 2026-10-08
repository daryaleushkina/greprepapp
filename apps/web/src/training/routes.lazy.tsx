import { createLazyRoute } from '@tanstack/react-router';
import { BuilderScreen } from './BuilderScreen';
import { SessionScreen } from './SessionScreen';

export const builderRoute = createLazyRoute('/app/training/new')({ component: BuilderScreen });
export const sessionRoute = createLazyRoute('/app/training/$trainingId')({ component: SessionScreen });
