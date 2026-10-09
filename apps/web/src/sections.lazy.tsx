import { createLazyRoute } from '@tanstack/react-router';
import { WordsScreen, ExamScreen } from './screens/placeholder/SectionPlaceholder';
import { StepScreen } from './screens/placeholder/StepScreen';
import { ProgressScreen } from './screens/progress/ProgressScreen';
import { SettingsScreen } from './screens/progress/SettingsScreen';

export const wordsRoute = createLazyRoute('/app/tabs/words')({ component: WordsScreen });
export const examRoute = createLazyRoute('/app/tabs/exam')({ component: ExamScreen });
export const progressRoute = createLazyRoute('/app/tabs/progress')({ component: ProgressScreen });
export const settingsRoute = createLazyRoute('/app/tabs/settings')({ component: SettingsScreen });
export const stepRoute = createLazyRoute('/app/step/$stepId')({ component: StepScreen });
