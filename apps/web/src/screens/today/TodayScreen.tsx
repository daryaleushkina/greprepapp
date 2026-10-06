// «Сегодня»: лента шагов на сегодня с сервера (/api/today) — только то, что сервер отдаёт: название, раздел, минуты,
// состояние; прогресс «4 из 10» и итоги «8 из 10 верно» придут с тренировками (решение Даши 06.10.2026).
// Состояния — как в макетах T1–T6 и в приложении
// Apple: загрузка скелетом той же геометрии, «Нет сети» и «Не получилось» с повтором; если план уже был на
// экране, а обновить его не вышло, — план остаётся и над ним тихая строка.
import { isApiError, useGetToday, type TodayStep } from '@greprep/api-client';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { OfflineIcon } from '../../components/icons';
import { StatusScreen } from '../../components/StatusScreen';
import { reportError } from '../../errors/report';
import { useI18n } from '../../i18n/i18n';
import { useGlow } from '../../layout/AppLayout';
import { useSession } from '../../session/session';
import { useOnline } from '../../useOnline';
import { RibbonSkeleton, StepRibbon } from './StepRibbon';
import { todaySummary } from './summary';
import styles from './Today.module.css';

export function TodayScreen(): ReactNode {
  const { t } = useI18n();
  const { session } = useSession();
  const setGlow = useGlow();
  const online = useOnline();
  const navigate = useNavigate();
  const [blockedStepId, setBlockedStepId] = useState<string | null>(null);
  // Повторы — только при нехватке сети (queryClient.ts); без сети запрос ждёт её возвращения.
  const today = useGetToday({ query: { enabled: session.status === 'signedIn' } });
  const plan = today.data;
  const current = plan?.steps.find((s) => s.state === 'current');

  // До отрисовки кадра: из эффекта после неё браузер успел бы показать кадр со светом прошлого экрана.
  useLayoutEffect(() => {
    setGlow(current?.section ?? 'verbal');
  }, [current?.section, setGlow]);

  // Ответ не по договору — ошибка у нас, а не у человека: в отчёт.
  const error = today.error;
  useEffect(() => {
    if (isApiError(error) && error.kind === 'contract') reportError(error);
  }, [error]);

  // Без сети TanStack Query не шлёт запрос, а ставит его на паузу до возвращения сети (и запрос сессии тоже —
  // тогда план ещё и не начинал грузиться). Всё это — «нет сети», а не вечный скелет.
  const offline = !online || today.fetchStatus === 'paused' || (isApiError(error) && error.kind === 'network');

  // Новую сессию без сети не начать (PRODUCT.md, «Operating Context»): вместо перехода — объяснение у шага.
  const start = (step: TodayStep) => {
    if (offline) {
      setBlockedStepId(step.id);
      return;
    }
    setBlockedStepId(null);
    void navigate({ to: '/step/$stepId', params: { stepId: step.id } });
  };

  // Компьютер: Enter начинает текущий шаг (web-T1). Только когда фокус ни на чём: на кнопке и в поле Enter делает своё.
  // Обработчик — в ref: новая функция на каждый рендер иначе переподписывала бы клавиатуру.
  const startCurrent = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    startCurrent.current = current ? () => start(current) : null;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      startCurrent.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t.today.title}</h1>
        {plan ? (
          <p className={styles.summary} data-testid="today-summary">
            {todaySummary(plan.steps, t.today)}
          </p>
        ) : (
          today.isPending && !offline && <span aria-hidden="true" className={`${styles.skLine} ${styles.sk}`} data-w="summary" />
        )}
      </header>

      {plan ? (
        <>
          {(today.isError || offline) && (
            <p className={styles.stale} role="status">
              {offline ? t.today.staleOffline : t.today.staleFailed}
            </p>
          )}
          {plan.steps.length > 0 && <StepRibbon steps={plan.steps} blockedStepId={offline ? blockedStepId : null} onStart={start} />}
        </>
      ) : today.isError || offline ? (
        <StatusScreen
          heading="h2"
          live
          icon={offline ? <OfflineIcon /> : undefined}
          title={offline ? t.today.offlineTitle : t.today.failedTitle}
          text={offline ? t.today.offlineText : t.today.failedText}
          action={{ label: t.today.retry, onClick: () => void today.refetch() }}
        />
      ) : (
        <>
          <p role="status" className="visually-hidden">
            {t.today.loading}
          </p>
          <RibbonSkeleton />
        </>
      )}
    </div>
  );
}
