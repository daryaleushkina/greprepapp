// Группа T. Экраны регистрируются через NS.add; разметка — внутри .app, стили — screens/t.css на токенах core.css.

NS.add({ id: 'T1', group: 'T', name: 'Тренировка — главная', html: `
<div class="app has-nav" data-screen="home">
  <nav class="nav" aria-label="Разделы">
    <button type="button" class="exam-switch" aria-label="Экзамен: GRE, сменить"><span class="exam-switch-name">GRE</span><svg class="ic-sm"><use href="#i-chevron-down"/></svg></button>
    <a class="nav-item" href="#" aria-current="page"><svg class="ic"><use href="#i-train"/></svg><span>Тренировка</span></a>
    <a class="nav-item" href="#"><svg class="ic"><use href="#i-words"/></svg><span>Слова</span></a>
    <a class="nav-item" href="#"><svg class="ic"><use href="#i-exam"/></svg><span>Экзамен</span></a>
    <a class="nav-item" href="#"><svg class="ic"><use href="#i-progress"/></svg><span>Прогресс</span></a>
  </nav>
  <div class="main">
    <header class="top">
      <button type="button" class="exam-switch exam-switch-top" aria-label="Экзамен: GRE, сменить"><span class="exam-switch-name">GRE</span><svg class="ic-sm"><use href="#i-chevron-down"/></svg></button>
    </header>
    <div class="home-grid">
      <section class="home-primary">
        <h1 class="h1">Тренировка</h1>
        <article class="start-card sec-verbal">
          <p class="eyebrow">Как в прошлый раз</p>
          <h2 class="start-title">Text Completion</h2>
          <p class="start-meta"><span class="sec-dot"></span>Verbal · 10 вопросов · Практика · ~12 мин</p>
          <div class="start-actions">
            <button type="button" class="btn btn-primary">Начать</button>
            <button type="button" class="btn btn-ghost"><svg class="ic-sm"><use href="#i-sliders"/></svg>Настроить</button>
          </div>
        </article>
        <h2 class="h2">Выбрать раздел</h2>
        <ul class="sections" role="list">
          <li class="section-row sec-verbal">
            <a href="#" class="section-link">
              <span class="section-mark"></span>
              <span class="section-body">
                <span class="section-name">Verbal</span>
                <span class="section-types">Text Completion · Sentence Equivalence · Reading Comprehension</span>
              </span>
              <span class="section-stat"><b>68 %</b><small>верно</small></span>
              <svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg>
            </a>
          </li>
          <li class="section-row sec-quant">
            <a href="#" class="section-link">
              <span class="section-mark"></span>
              <span class="section-body">
                <span class="section-name">Quant</span>
                <span class="section-types">Quantitative Comparison · Задачи · Data Interpretation</span>
              </span>
              <span class="section-stat"><b>74 %</b><small>верно</small></span>
              <svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg>
            </a>
          </li>
          <li class="section-row sec-essay">
            <a href="#" class="section-link">
              <span class="section-mark"></span>
              <span class="section-body">
                <span class="section-name">Эссе</span>
                <span class="section-types">Analyze an Issue · 30 минут</span>
              </span>
              <span class="section-stat"><b>4,5</b><small>из 6</small></span>
              <svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg>
            </a>
          </li>
        </ul>
      </section>
      <aside class="home-side">
        <a href="#" class="side-card side-mistakes">
          <svg class="ic"><use href="#i-repeat"/></svg>
          <span><b>Повторить мои ошибки</b><small>12 заданий из прошлых тренировок</small></span>
          <svg class="ic-sm"><use href="#i-chevron-right"/></svg>
        </a>
        <a href="#" class="side-card side-weak">
          <svg class="ic"><use href="#i-book"/></svg>
          <span><b>Слабое место: Inference</b><small>Reading Comprehension · 52 % верно</small></span>
          <svg class="ic-sm"><use href="#i-chevron-right"/></svg>
        </a>
        <div class="side-week">
          <p class="eyebrow">Эта неделя</p>
          <p class="week-line"><b>4 дня</b> · 2 ч 10 мин · 86 заданий</p>
        </div>
      </aside>
    </div>
  </div>
</div>
` });

NS.add({ id: 'T3', group: 'T', name: 'Выбор экзамена', html: `
<div class="app no-nav" data-screen="exam">
  <div class="main exam-main">
    <div class="exam-head">
      <h1 class="h1">К какому экзамену готовишься?</h1>
      <p class="lead">Задания, слова и пробник подстроятся под него. Сменить можно в любой момент.</p>
    </div>
    <div class="exam-cards" role="list">
      <button type="button" class="exam-card exam-gre" role="listitem">
        <span class="exam-name">GRE</span>
        <span class="exam-what">Магистратура и PhD</span>
        <span class="exam-parts">Verbal · Quant · эссе</span>
        <span class="exam-go"><svg class="ic-sm"><use href="#i-chevron-right"/></svg></span>
      </button>
      <button type="button" class="exam-card exam-toefl" role="listitem">
        <span class="exam-name">TOEFL</span>
        <span class="exam-what">Английский для учёбы</span>
        <span class="exam-parts">Reading · Listening · Writing · Speaking</span>
        <span class="exam-go"><svg class="ic-sm"><use href="#i-chevron-right"/></svg></span>
      </button>
    </div>
    <p class="exam-soon">Скоро: SAT, GMAT</p>
  </div>
</div>
` });

// ---------- Иконки группы ----------
NS.icon('i-t-offline', '<path d="M2 8.5a15 15 0 0 1 5-3M22 8.5a15 15 0 0 0-9.5-3.9M5.5 12.2a10 10 0 0 1 4-2.3M18.5 12.2a10 10 0 0 0-2.2-1.6M9 15.6a5 5 0 0 1 6 0M12 19.5h.01M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');

// ---------- T2 · первый запуск ----------
// Экзамен уже выбран, истории нет: вместо «Как в прошлый раз» — первая тренировка по умолчанию, процентов и
// «Повторить ошибки» ещё нет. Одно главное действие — «Начать».
NS.add({ id: 'T2', group: 'T', name: 'Тренировка — первый запуск', html: `
<div class="app has-nav" data-screen="home">
  ${NS.nav('train')}
  <div class="main">
    ${NS.top()}
    <div class="home-grid">
      <section class="home-primary">
        <h1 class="h1">Тренировка</h1>
        <article class="start-card sec-verbal">
          <p class="eyebrow">Первая тренировка</p>
          <h2 class="start-title">Verbal</h2>
          <p class="start-meta"><span class="sec-dot"></span>Text Completion · 10 вопросов · ~12 мин</p>
          <p class="t-first-note">После каждого ответа — разбор на вашем языке: почему верно и где ловушка в остальных вариантах.</p>
          <div class="start-actions">
            <button type="button" class="btn btn-primary">Начать</button>
            <button type="button" class="btn btn-ghost"><svg class="ic-sm"><use href="#i-sliders"/></svg>Настроить</button>
          </div>
        </article>
        <h2 class="h2">Выбрать раздел</h2>
        <ul class="sections" role="list">
          <li class="section-row sec-verbal"><a href="#" class="section-link"><span class="section-mark"></span><span class="section-body"><span class="section-name">Verbal</span><span class="section-types">Text Completion · Sentence Equivalence · Reading Comprehension</span></span><svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg></a></li>
          <li class="section-row sec-quant"><a href="#" class="section-link"><span class="section-mark"></span><span class="section-body"><span class="section-name">Quant</span><span class="section-types">Quantitative Comparison · Задачи · Data Interpretation</span></span><svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg></a></li>
          <li class="section-row sec-essay"><a href="#" class="section-link"><span class="section-mark"></span><span class="section-body"><span class="section-name">Эссе</span><span class="section-types">Analyze an Issue · 30 минут</span></span><svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg></a></li>
        </ul>
      </section>
      <aside class="home-side">
        <a href="#" class="side-card">
          <svg class="ic"><use href="#i-words"/></svg>
          <span><b>Первые 12 слов</b><small>~5 минут, с озвучкой</small></span>
          <svg class="ic-sm"><use href="#i-chevron-right"/></svg>
        </a>
      </aside>
    </div>
  </div>
</div>
` });

// ---------- T4 · вход вне Telegram ----------
// Кнопки — официального вида каждой компании (PRODUCT.md, «Stack»), Telegram первым. Дисклеймер ETS — здесь и
// в настройках, на остальных экранах его нет (решение Даши 07.10.2026).
NS.add({ id: 'T4', group: 'T', name: 'Вход вне Telegram', html: `
<div class="app no-nav" data-screen="signin">
  <div class="main t-signin">
    <div class="t-signin-head">
      <p class="t-brand">[Имя]</p>
      <h1 class="h1">Подготовка к экзамену с разбором каждой ошибки</h1>
      <p class="lead">GRE® и TOEFL®: задания, слова и пробник. Объяснения — по-русски и по-английски.</p>
    </div>
    <div class="t-signin-buttons">
      <button type="button" class="t-sib t-sib-telegram">
        <svg viewBox="0 0 22 22" aria-hidden="true"><path fill="currentColor" d="M2.81376 10.5943C7.36914 8.61002 10.406 7.30175 11.9245 6.66971C16.265 4.86489 17.1658 4.55143 17.7542 4.54094C17.8836 4.53874 18.1716 4.57072 18.3596 4.72281C18.5158 4.85097 18.5598 5.0243 18.5818 5.14588C18.6013 5.26745 18.6282 5.54454 18.6062 5.76083C18.3719 8.23138 17.3539 14.2266 16.8363 16.9938C16.619 18.1647 16.1869 18.5572 15.7695 18.5955C14.8613 18.679 14.1728 17.996 13.294 17.42C11.9196 16.5185 11.1433 15.9575 9.80793 15.0779C8.26505 14.0613 9.26594 13.5025 10.1448 12.5895C10.3743 12.3505 14.373 8.71426 14.4487 8.38445C14.4585 8.34319 14.4683 8.18939 14.3755 8.10834C14.2852 8.02705 14.1508 8.05488 14.0532 8.07685C13.914 8.1081 11.7193 9.56015 7.4618 12.4328C6.83928 12.861 6.27536 13.0697 5.76758 13.0587C5.21097 13.0468 4.13689 12.7433 3.3386 12.484C2.3621 12.166 1.5833 11.9977 1.65166 11.4575C1.68583 11.1763 2.07406 10.8884 2.81376 10.5943Z"/></svg>
        Войти через Telegram
      </button>
      <button type="button" class="t-sib t-sib-apple">
        <svg viewBox="0 0 814 1000" aria-hidden="true"><path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
        Войти с Apple
      </button>
      <button type="button" class="t-sib t-sib-google">
        <!-- Цветная «G» — официальный знак Google; его цвета — часть знака, а не нашей палитры. -->
        <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Войти с Google
      </button>
    </div>
    <footer class="t-signin-foot">
      <p>Продолжая, вы принимаете <a href="#">условия</a> и <a href="#">политику конфиденциальности</a>.</p>
      <p lang="en">GRE® and TOEFL® are registered trademarks of Educational Testing Service (ETS). This product is not endorsed or approved by ETS.</p>
    </footer>
  </div>
</div>
` });

// ---------- T5 · загрузка главной ----------
// Скелет той же геометрии, что T1: при подмене на данные ничего не прыгает. Вкладки и переключатель — настоящие.
NS.add({ id: 'T5', group: 'T', name: 'Тренировка — загрузка', html: `
<div class="app has-nav" data-screen="home" aria-busy="true">
  ${NS.nav('train')}
  <div class="main">
    ${NS.top()}
    <div class="home-grid">
      <section class="home-primary">
        <h1 class="h1">Тренировка</h1>
        <div class="start-card t-skel-card" aria-hidden="true">
          <span class="t-skel" style="width:34%;height:13px"></span>
          <span class="t-skel" style="width:62%;height:28px"></span>
          <span class="t-skel" style="width:80%;height:14px"></span>
          <span class="t-skel-row"><span class="t-skel t-skel-btn"></span><span class="t-skel t-skel-btn t-skel-btn-sm"></span></span>
        </div>
        <span class="t-skel t-skel-h2" aria-hidden="true"></span>
        <ul class="sections" role="list" aria-hidden="true">
          <li class="section-row t-skel-section"><span class="t-skel t-skel-dot"></span><span class="t-skel-lines"><span class="t-skel" style="width:30%;height:16px"></span><span class="t-skel" style="width:78%;height:12px"></span></span></li>
          <li class="section-row t-skel-section"><span class="t-skel t-skel-dot"></span><span class="t-skel-lines"><span class="t-skel" style="width:26%;height:16px"></span><span class="t-skel" style="width:70%;height:12px"></span></span></li>
          <li class="section-row t-skel-section"><span class="t-skel t-skel-dot"></span><span class="t-skel-lines"><span class="t-skel" style="width:22%;height:16px"></span><span class="t-skel" style="width:52%;height:12px"></span></span></li>
        </ul>
        <span class="t-sr">Загружаем тренировку</span>
      </section>
      <aside class="home-side" aria-hidden="true">
        <div class="side-card t-skel-side"><span class="t-skel t-skel-dot"></span><span class="t-skel-lines"><span class="t-skel" style="width:60%;height:14px"></span><span class="t-skel" style="width:84%;height:12px"></span></span></div>
        <div class="side-card t-skel-side"><span class="t-skel t-skel-dot"></span><span class="t-skel-lines"><span class="t-skel" style="width:54%;height:14px"></span><span class="t-skel" style="width:72%;height:12px"></span></span></div>
      </aside>
    </div>
  </div>
</div>
` });

// ---------- T6 · нет сети на вопросе ----------
// Тихая строка сверху, без модального окна: начатая сессия живёт без сети, ответы копятся и уходят сами
// (решение Даши 06.10.2026).
NS.add({ id: 'T6', group: 'T', name: 'Нет сети на вопросе', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    <header class="session-top sec-verbal">
      <button type="button" class="icon-btn" aria-label="Закрыть тренировку"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>Verbal · Text Completion</span>
        <span class="session-count">4 из 10</span>
      </div>
      <div class="session-bar" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="3" aria-label="Пройдено 3 из 10"><span style="width:30%"></span></div>
    </header>
    <p class="t-offline" role="status"><svg class="ic-sm"><use href="#i-t-offline"/></svg>Нет сети — ответы сохранятся и уйдут сами</p>
    <div class="q-layout">
      <section class="q-stem">
        <p class="q-instr">Выберите один вариант.</p>
        <p class="q-text">The new survey’s results were so <span class="blank">&nbsp;</span> that even researchers who had doubted the original study conceded that its conclusions held.</p>
      </section>
      <section class="q-answers">
        <fieldset class="opt-group">
          <legend class="t-sr">Варианты ответа</legend>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>equivocal</button>
          <button type="button" class="opt" role="radio" aria-checked="true"><span class="oval"></span>compelling</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>tentative</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>provisional</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>obscure</button>
        </fieldset>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
</div>
` });

// ---------- T7 · смена экзамена ----------
// Шторка поверх главной (T1): один активный экзамен на аккаунт, выбор общий для всех устройств
// (решение Даши 09.10.2026). Нажатие на экзамен меняет его сразу, отдельной кнопки нет.
{
  const home = NS.screens.find(s => s.id === 'T1').html;
  const sheet = `
  <div class="scrim" aria-hidden="true"></div>
  <section class="sheet t-exam-sheet" role="dialog" aria-modal="true" aria-labelledby="t7-title">
    <h2 class="h2" id="t7-title">Экзамен</h2>
    <div class="t-exam-list" role="radiogroup" aria-labelledby="t7-title">
      <button type="button" class="t-exam-row" role="radio" aria-checked="true">
        <span class="t-exam-name">GRE</span>
        <span class="t-exam-body"><b>Магистратура и PhD</b><small>Verbal · Quant · эссе</small></span>
        <span class="t-exam-check"><svg class="ic-sm"><use href="#i-check"/></svg></span>
      </button>
      <button type="button" class="t-exam-row" role="radio" aria-checked="false">
        <span class="t-exam-name">TOEFL</span>
        <span class="t-exam-body"><b>Английский для учёбы</b><small>Reading · Listening · Writing · Speaking</small></span>
        <span class="t-exam-check"></span>
      </button>
    </div>
    <p class="t-exam-note">Прогресс у каждого экзамена свой и не теряется при смене. Скоро: SAT, GMAT.</p>
  </section>
`;
  const i = home.lastIndexOf('</div>');
  NS.add({ id: 'T7', group: 'T', name: 'Смена экзамена', html: home.slice(0, i) + sheet + home.slice(i) });
}
