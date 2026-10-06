// Оболочка экранов после входа.
//   • AppGate — пускает только вошедших: сайт без сессии уводит на вход; мини-апп, который не смог войти по
//     initData, показывает причину и «Повторить».
//   • TabsLayout — экраны-разделы: в мини-аппе и на узком сайте — стеклянная капсула вкладок снизу; на сайте
//     600–899 px — строка разделов сверху, шире — боковая панель (решение Даши 06.10.2026, DESIGN.md «Navigation»).
import { isApiError } from '@greprep/api-client';
import { Link, Navigate, Outlet, useMatchRoute, useRouter } from '@tanstack/react-router';
import { createContext, use, useState, type ReactNode } from 'react';
import { BrandMark } from '../components/BrandMark';
import { BackIcon, ExamIcon, ProgressIcon, SettingsIcon, TodayIcon, WordsIcon } from '../components/icons';
import { FullScreenStatus } from '../components/FullScreenStatus';
import { BRAND_NAME } from '../config';
import { useI18n } from '../i18n/i18n';
import { useSession } from '../session/session';
import { useShell } from '../shellContext';
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
  if (session.status === 'signedOut') {
    return <Navigate to="/signin" search={session.expired ? { reason: 'expired' } : {}} replace />;
  }
  if (session.status === 'error') {
    const offline = isApiError(session.error) && session.error.kind === 'network';
    const tooMany = isApiError(session.error) && session.error.code === 'too_many_requests';
    return (
      <FullScreenStatus
        live
        title={offline ? t.today.offlineTitle : t.signIn.failed}
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
          <span>{BRAND_NAME}</span>
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
export function FocusLayout({ glow, children }: { glow: Glow; children: ReactNode }): ReactNode {
  const { shell } = useShell();
  return (
    <div className={styles.frame} data-shell={shell} data-glow={glow} data-nested>
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
