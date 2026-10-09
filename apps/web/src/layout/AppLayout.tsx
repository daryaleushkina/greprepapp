// Оболочка экранов после входа.
//   • AppGate — пускает только вошедших: сайт без сессии уводит на вход; мини-апп, который не смог войти по
//     initData, показывает причину и «Повторить».
//   • TabsLayout — экраны-разделы: в мини-аппе и на узком сайте — стеклянная капсула вкладок снизу; на сайте
//     600–899 px — строка разделов сверху, шире — боковая панель (решение Даши 06.10.2026, DESIGN.md «Navigation»).
import { isApiError } from '@greprep/api-client';
import { Link, Navigate, Outlet, useMatch, useMatchRoute, useRouter, useRouterState } from '@tanstack/react-router';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { returnToSearch } from '../auth/returnTo';
import { BrandMark } from '../components/BrandMark';
import { BackIcon, ExamIcon, ProgressIcon, SettingsIcon, TodayIcon, WordsIcon } from '../components/icons';
import { FullScreenStatus } from '../components/FullScreenStatus';
import { BRAND_NAME } from '../config';
import { useI18n } from '../i18n/i18n';
import { useSession } from '../session/session';
import { useShell } from '../shellContext';
import { loadSections } from '../sections';
import { useTrainingSwipes } from '../telegram/hooks';
import { useStoredTraining } from '../training/hooks';
import glass from '../styles/glass.module.css';
import styles from './AppLayout.module.css';

export type Glow = 'verbal' | 'quant' | 'words' | 'essay' | 'exam';

const GlowContext = createContext<(glow: Glow) => void>(() => {});

/** Экран задаёт цвет света сверху — цвет раздела текущего шага (DESIGN.md, «Elevation & Depth»). */
export function useGlow(): (glow: Glow) => void {
  return use(GlowContext);
}

export function AppGate(): ReactNode {
  const { session } = useSession();
  const { t } = useI18n();
  const { shell } = useShell();
  const href = useRouterState({ select: (state) => state.location.href });
  const returnTo = useRef(href);
  // Navigate меняет адрес раньше, чем уходит AppGate: не заменяем исходный экран адресом самого входа.
  if (session.status !== 'signedOut') returnTo.current = href;
  useEffect(() => {
    if (session.status !== 'signedIn') return;
    const preload = () => {
      if (navigator.onLine) {
        // Необязательный фон: при отказе переход покажет «Нет сети» с повтором; online попробует догрузить.
        void loadSections().catch(() => {});
      }
    };
    // Даём первому экрану кадр, прежде чем догружать вкладки.
    const frame = requestAnimationFrame(preload);
    window.addEventListener('online', preload);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('online', preload); };
  }, [session.status]);
  // Сверяем id маршрута: сопоставление одного пути приняло бы /training/new за id тренировки.
  const questionId = useMatch({ from: '/app/training/$trainingId', shouldThrow: false, select: (match) => match.params.trainingId });
  const report = useMatch({ from: '/app/training/$trainingId/report/$position', shouldThrow: false, select: () => true });
  const training = useStoredTraining(questionId ?? '', shell === 'telegram' && Boolean(questionId));
  // Один владелец свайпа переживает переход вопрос ↔ жалоба, включая загрузку ленивого маршрута.
  useTrainingSwipes(shell === 'telegram' && session.status === 'signedIn' &&
    (Boolean(report) || Boolean(questionId && (training.isPending || training.data && !training.data.finish))));
  if (session.status === 'signedOut') {
    return <Navigate to="/signin" search={{ ...(!session.signedOutByUser && returnToSearch(returnTo.current)), ...(session.expired && { reason: 'expired' }) }} replace />;
  }
  if (session.status === 'error') {
    const offline = isApiError(session.error) && session.error.kind === 'network';
    const tooMany = isApiError(session.error) && session.error.code === 'too_many_requests';
    return (
      <FullScreenStatus
        live
        title={offline ? t.today.offlineTitle : t.signIn.failedTitle}
        text={offline ? t.signIn.offline : tooMany ? t.signIn.tooMany : t.today.failedText}
        action={{ label: t.today.retry, onClick: session.retry }}
      />
    );
  }
  return <Outlet />;
}

// Вкладка горит по пути, а не по параметрам адреса: у мини-аппа в адресе параметры запуска Telegram, и с точным
// сравнением параметров «Сегодня» не горела бы никогда.
const TABS = [
  { to: '/', key: 'today', Icon: TodayIcon },
  { to: '/words', key: 'words', Icon: WordsIcon },
  { to: '/exam', key: 'exam', Icon: ExamIcon },
  { to: '/progress', key: 'progress', Icon: ProgressIcon },
] as const;

export function TabsLayout(): ReactNode {
  const { shell } = useShell();
  const [glow, setGlow] = useState<Glow>('verbal');
  const matchRoute = useMatchRoute();
  // Настройки на телефоне — вложенный экран из «Прогресса»: без капсулы, с «назад».
  const nested = Boolean(matchRoute({ to: '/settings' }));
  return (
    <GlowContext value={setGlow}>
      <div className={styles.frame} data-shell={shell} data-glow={glow} data-nested={nested || undefined}>
        {shell === 'site' && <SiteNav />}
        <main className={`app-shell ${styles.main}`} id="main">
          <div className={styles.column}>
            <Outlet />
          </div>
        </main>
        <TabBar />
      </div>
    </GlowContext>
  );
}

/** Стеклянная капсула вкладок «Сегодня · Слова · Экзамен · Прогресс». */
function TabBar(): ReactNode {
  const { t } = useI18n();
  return (
    <>
      <span aria-hidden="true" className={styles.fade} />
      <nav aria-label={t.tabs.sections} className={`tabbar ${glass.glass} ${styles.tabBar}`}>
        {TABS.map(({ to, key, Icon }) => (
          <Link key={key} to={to} className={styles.tab} activeProps={{ 'aria-current': 'page' }} activeOptions={{ exact: to === '/', includeSearch: false }}>
            <Icon />
            <span>{t.tabs[key]}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

/** Сайт: боковая панель (шире 900 px) или строка сверху (600–899 px); уже — её место занимает капсула. */
function SiteNav(): ReactNode {
  const { t } = useI18n();
  return (
    <aside className={styles.sideWrap}>
      <nav aria-label={t.tabs.sections} className={`${glass.glass} ${styles.side}`}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandTile}>
            <BrandMark />
          </span>
          <span className={styles.brandName}>{BRAND_NAME}</span>
        </Link>
        {TABS.map(({ to, key, Icon }) => (
          <Link key={key} to={to} className={styles.navItem} activeProps={{ 'aria-current': 'page' }} activeOptions={{ exact: to === '/', includeSearch: false }}>
            <Icon />
            {t.tabs[key]}
          </Link>
        ))}
        <span className={styles.spacer} />
        <Link
          to="/settings"
          className={`${styles.navItem} ${styles.settingsItem}`}
          activeProps={{ 'aria-current': 'page' }}
          activeOptions={{ includeSearch: false }}
        >
          <SettingsIcon />
          <span className={styles.settingsLabel}>{t.tabs.settings}</span>
        </Link>
      </nav>
    </aside>
  );
}

/**
 * Экран сессии без вкладок (шаг ленты): режим фокуса — без панели и капсулы, тот же свет и та же колонка
 * (DESIGN.md, «Navigation»: «сессии — режим фокуса без панели»).
 */
export function FocusLayout({ glow, children, training = false, wide = false, session = false }: { glow: Glow; children: ReactNode; training?: boolean; wide?: boolean; session?: boolean }): ReactNode {
  const { shell } = useShell();
  return (
    <div className={styles.frame} data-shell={shell} data-glow={glow} data-nested data-training={training || undefined} data-wide={wide || undefined} data-session={session || undefined}>
      <main className={`app-shell ${styles.main}`} id="main">
        <div className={styles.column}>{children}</div>
      </main>
    </div>
  );
}

/**
 * «Назад» на сайте для вложенных экранов (в мини-аппе — кнопка «назад» Telegram). narrowOnly — только уже 600 px:
 * шире у того же экрана есть панель разделов.
 */
export function BackLink({ fallback, narrowOnly = false }: { fallback: '/' | '/progress'; narrowOnly?: boolean }): ReactNode {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Link
      to={fallback}
      className={narrowOnly ? `${styles.back} ${styles.narrowOnly}` : styles.back}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        // Пришли изнутри приложения — назад по истории (сохраняется прокрутка); открыли по ссылке — в раздел.
        if (router.history.canGoBack()) {
          e.preventDefault();
          router.history.back();
        }
      }}
    >
      <BackIcon />
      {t.back}
    </Link>
  );
}
