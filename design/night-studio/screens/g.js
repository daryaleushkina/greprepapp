// Группа G — «Прогресс и аккаунт». Экраны регистрируются через NS.add; стили — screens/g.css на токенах core.css.
// Статистика — по решению Даши 09.10.2026 (PRODUCT.md, «Статистика и история»): балл с пометкой «наша оценка»,
// точность и её динамика, слабое место, календарь без серий и без отметок о пропусках, история.
// Данные согласованы с другими группами: Verbal 68 %, Quant 74 %, Inference 52 %, пробник 2 октября V 154 · Q 160.

NS.icon('i-g-gear', '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>');
NS.icon('i-g-mail', '<path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>');
NS.icon('i-g-key', '<circle cx="8" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
NS.icon('i-g-card', '<rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M7 15h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
NS.icon('i-g-save', '<path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 4v5h7V4M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>');
NS.icon('i-g-pen', '<path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2"/>');

// Строка заголовка раздела «Прогресс»: заголовок и шестерёнка настроек справа.
const gTitle = (title) => `<div class="g-title-row"><h1 class="h1">${title}</h1><button type="button" class="icon-btn g-gear" aria-label="Настройки"><svg class="ic"><use href="#i-g-gear"/></svg></button></div>`;
const gBack = (to) => `<header class="top top-back"><button type="button" class="icon-btn" aria-label="Назад: ${to}"><svg class="ic"><use href="#i-back"/></svg></button><span class="top-title">${to}</span></header>`;

// Динамика точности за 6 недель: Verbal 58 → 68 (+6 за 2 недели), Quant 69 → 74 (+2). Шкала 50–80 %.
// Ось Y — 3 линии сетки; x — недели. Значения ставятся одной шкалой: y = 112 - (v - 50) * 3.2.
const gTrend = `
<figure class="g-trend" aria-label="Точность по неделям: Verbal выросла с 58 до 68 %, Quant — с 69 до 74 %">
  <svg viewBox="0 0 320 132" role="img" aria-hidden="true">
    <g class="g-grid">
      <line x1="28" x2="300" y1="16" y2="16"/><line x1="28" x2="300" y1="48" y2="48"/><line x1="28" x2="300" y1="80" y2="80"/><line x1="28" x2="300" y1="112" y2="112"/>
    </g>
    <g class="g-axis">
      <text x="22" y="20">80</text><text x="22" y="52">70</text><text x="22" y="84">60</text><text x="22" y="116">50</text>
      <text x="40" y="128" text-anchor="middle">31 авг</text><text x="246" y="128" text-anchor="middle">28 сен</text><text x="288" y="128" text-anchor="middle">5 окт</text>
    </g>
    <polyline class="g-line g-line-verbal" points="40,86.4 90,80 140,76.8 190,73.6 240,60.8 288,54.4"/>
    <polyline class="g-line g-line-quant" points="40,51.2 90,48 140,44.8 190,41.6 240,38.4 288,35.2"/>
    <circle class="g-end g-end-verbal" cx="288" cy="54.4" r="4"/>
    <circle class="g-end g-end-quant" cx="288" cy="35.2" r="4"/>
  </svg>
</figure>`;

const gAccuracy = `
<section class="acc-card g-acc">
  <h2 class="h3">Точность</h2>
  <div class="g-sec-pair">
    <div class="g-sec sec-verbal"><span class="g-sec-name"><span class="sec-dot"></span>Verbal</span><span class="g-sec-num">68&thinsp;%</span><span class="g-delta">+6 % за 2 недели</span></div>
    <div class="g-sec sec-quant"><span class="g-sec-name"><span class="sec-dot"></span>Quant</span><span class="g-sec-num">74&thinsp;%</span><span class="g-delta">+2 % за 2 недели</span></div>
  </div>
  ${gTrend}
  <ul class="acc-list" role="list">
    <li class="acc-row sec-verbal"><span class="acc-name">Text Completion</span><span class="acc-bar"><span style="width:61%"></span></span><span class="acc-val">61 %</span></li>
    <li class="acc-row sec-verbal"><span class="acc-name">Sentence Equivalence</span><span class="acc-bar"><span style="width:77%"></span></span><span class="acc-val">77 %</span></li>
    <li class="acc-row sec-verbal acc-weak"><span class="acc-name">Reading Comprehension</span><span class="acc-bar"><span style="width:52%"></span></span><span class="acc-val">52 %</span></li>
    <li class="acc-row sec-quant"><span class="acc-name">Quantitative Comparison</span><span class="acc-bar"><span style="width:81%"></span></span><span class="acc-val">81 %</span></li>
    <li class="acc-row sec-quant"><span class="acc-name">Задачи</span><span class="acc-bar"><span style="width:70%"></span></span><span class="acc-val">70 %</span></li>
  </ul>
  <div class="g-weak">
    <p><b>Слабее всего — Inference</b><span>Reading Comprehension · 52 % верно за 3 недели</span></p>
    <button type="button" class="btn btn-ghost g-weak-btn">Потренировать</button>
  </div>
</section>`;

const gScore = `
<section class="score-card g-score">
  <h2 class="h3">Примерный балл</h2>
  <div class="score-pair">
    <div class="score sec-verbal"><span class="score-label">Verbal</span><span class="score-num">152–156</span></div>
    <div class="score sec-quant"><span class="score-label">Quant</span><span class="score-num">158–162</span></div>
  </div>
  <p class="score-note">Наша оценка по пробнику 2 октября, не официальный балл ETS.</p>
</section>`;

const gCalendar = `
<section class="cal-card">
  <h2 class="h3">Октябрь</h2>
  <p class="cal-sum"><b>9 дней</b> · 6 ч 40 мин</p>
  <div class="cal" role="img" aria-label="Календарь занятий за октябрь: 9 дней с занятиями">
    <span class="cal-wd">Пн</span><span class="cal-wd">Вт</span><span class="cal-wd">Ср</span><span class="cal-wd">Чт</span><span class="cal-wd">Пт</span><span class="cal-wd">Сб</span><span class="cal-wd">Вс</span>
    <span class="cal-d" data-l="0"></span><span class="cal-d" data-l="0"></span><span class="cal-d" data-l="2"></span><span class="cal-d" data-l="1"></span><span class="cal-d" data-l="0"></span><span class="cal-d" data-l="3"></span><span class="cal-d" data-l="0"></span>
    <span class="cal-d" data-l="1"></span><span class="cal-d" data-l="2"></span><span class="cal-d" data-l="0"></span><span class="cal-d" data-l="2"></span><span class="cal-d" data-l="0"></span><span class="cal-d" data-l="0"></span><span class="cal-d" data-l="1"></span>
    <span class="cal-d" data-l="3"></span><span class="cal-d cal-today" data-l="2"></span><span class="cal-d cal-future"></span><span class="cal-d cal-future"></span><span class="cal-d cal-future"></span><span class="cal-d cal-future"></span><span class="cal-d cal-future"></span>
  </div>
</section>`;

const gHistoryShort = `
<section class="hist-card">
  <h2 class="h3">История</h2>
  <ul class="hist" role="list">
    <li class="hist-row sec-verbal"><span class="sec-dot"></span><span class="hist-main"><b>Text Completion</b><small>Сегодня, 14:20 · Практика · 12 мин</small></span><span class="hist-res">8/10</span></li>
    <li class="hist-row sec-quant"><span class="sec-dot"></span><span class="hist-main"><b>Quantitative Comparison</b><small>Вчера · Проверка · 15 мин</small></span><span class="hist-res">13/15</span></li>
    <li class="hist-row sec-exam"><span class="sec-dot"></span><span class="hist-main"><b>Пробный экзамен 1</b><small>2 октября · 1 ч 58 мин</small></span><span class="hist-res">V 154 · Q 160</span></li>
  </ul>
  <a href="#" class="g-all">Вся история<svg class="ic-sm"><use href="#i-chevron-right"/></svg></a>
</section>`;

NS.add({ id: 'G1', group: 'G', name: 'Прогресс', html: `
<div class="app has-nav" data-screen="stats">
  ${NS.nav('progress')}
  <div class="main scroll g-stats-main">
    ${NS.top()}
    ${gTitle('Прогресс')}
    <div class="stats-grid g-stats">
      <div class="g-col">${gScore}${gAccuracy}</div>
      <div class="g-col">${gCalendar}${gHistoryShort}</div>
    </div>
  </div>
</div>
` });

// Строка настроек: подпись слева, значение или управление справа.
NS.add({ id: 'G2', group: 'G', name: 'Настройки', html: `
<div class="app has-nav" data-screen="settings">
  ${NS.nav('progress')}
  <div class="main scroll g-settings">
    ${gBack('Прогресс')}
    <h1 class="h1">Настройки</h1>
    <ul class="g-list" role="list">
      <li><a href="#" class="g-row"><span class="g-row-label">Экзамен</span><span class="g-row-value">GRE</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
    </ul>
    <ul class="g-list" role="list">
      <li class="g-row g-row-stack">
        <span class="g-row-label" id="g-lang">Язык</span>
        <div class="seg g-seg" role="group" aria-labelledby="g-lang"><button type="button" aria-pressed="true">Русский</button><button type="button" aria-pressed="false" lang="en">English</button></div>
      </li>
      <li class="g-row g-row-stack">
        <span class="g-row-label" id="g-theme">Тема</span>
        <div class="seg g-seg" role="group" aria-labelledby="g-theme"><button type="button" aria-pressed="false">Светлая</button><button type="button" aria-pressed="true">Тёмная</button></div>
      </li>
      <li class="g-row g-row-stack">
        <span class="g-row-label" id="g-size">Размер текста</span>
        <div class="seg g-seg" role="group" aria-labelledby="g-size"><button type="button" aria-pressed="true">Обычный</button><button type="button" aria-pressed="false">Крупнее</button></div>
      </li>
    </ul>
    <ul class="g-list" role="list">
      <li><a href="#" class="g-row"><svg class="ic g-row-ic"><use href="#i-g-card"/></svg><span class="g-row-label">Подписка</span><span class="g-row-value">до 9 ноября</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
      <li><a href="#" class="g-row"><svg class="ic g-row-ic"><use href="#i-g-key"/></svg><span class="g-row-label">Способы входа</span><span class="g-row-value">Telegram</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
      <li><a href="#" class="g-row"><svg class="ic g-row-ic"><use href="#i-g-mail"/></svg><span class="g-row-label">Написать нам</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
    </ul>
    <footer class="g-legal" lang="en">
      <p>GRE® and TOEFL® are registered trademarks of Educational Testing Service (ETS). This product is not endorsed or approved by ETS.</p>
      <p class="g-version" lang="ru">Версия 0.4.0</p>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'G3', group: 'G', name: 'Оформить подписку', html: `
<div class="app no-nav" data-screen="paywall">
  <div class="main scroll g-pay">
    <header class="top"><button type="button" class="icon-btn" aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button></header>
    <div class="g-pay-body">
      <div class="g-pay-head">
        <h1 class="h1">Готовьтесь без ограничений</h1>
        <p class="lead">Подписка на подготовку к GRE® и TOEFL® — на всех устройствах.</p>
      </div>
      <ul class="g-benefits" role="list">
        <li><svg class="ic"><use href="#i-train"/></svg><span><b>Все задания и пробники</b><small>Тренировки по каждому типу и два пробных экзамена</small></span></li>
        <li><svg class="ic"><use href="#i-book"/></svg><span><b>Разбор каждой ошибки</b><small>По-русски и по-английски, с темой, которую стоит повторить</small></span></li>
        <li><svg class="ic"><use href="#i-g-pen"/></svg><span><b>Оценка эссе</b><small>20 эссе в месяц, оценка примерная</small></span></li>
      </ul>
      <div class="g-price">
        <p class="g-price-main"><b>7 дней бесплатно</b>, затем [ЦЕНА] в месяц</p>
        <p class="g-price-beta">Бета-пользователям — скидка</p>
      </div>
      <div class="g-pay-cta">
        <button type="button" class="btn btn-primary btn-wide">Попробовать 7 дней</button>
        <p class="g-fine">Оплата через Tribute — картой или по СБП. Отменить можно в любой момент. <a href="#">Условия</a></p>
        <p class="g-fine" lang="en">GRE® and TOEFL® are registered trademarks of Educational Testing Service (ETS). This product is not endorsed or approved by ETS.</p>
      </div>
    </div>
  </div>
</div>
` });

NS.add({ id: 'G4', group: 'G', name: 'Подписка активна', html: `
<div class="app has-nav" data-screen="subscription">
  ${NS.nav('progress')}
  <div class="main scroll g-sub">
    ${gBack('Настройки')}
    <h1 class="h1">Подписка</h1>
    <section class="g-sub-card">
      <p class="g-sub-status"><span class="g-ok"><svg class="ic-sm"><use href="#i-check"/></svg></span>Активна до 9 ноября</p>
      <dl class="g-facts">
        <div><dt>Продлится</dt><dd>9 ноября, [ЦЕНА]</dd></div>
        <div><dt>Оплата</dt><dd>Tribute</dd></div>
      </dl>
    </section>
    <section class="g-sub-card">
      <h2 class="h3">Эссе в этом месяце</h2>
      <p class="g-quota"><span class="g-quota-num">18</span> из 20 осталось</p>
      <div class="g-quota-bar" role="progressbar" aria-valuemin="0" aria-valuemax="20" aria-valuenow="18" aria-label="Осталось 18 эссе из 20"><span style="width:90%"></span></div>
      <p class="g-fine">Лимит обновится 1 ноября.</p>
    </section>
    <a href="#" class="g-quiet">Отменить подписку</a>
  </div>
</div>
` });

NS.add({ id: 'G5', group: 'G', name: 'Доступ закончился', html: `
<div class="app no-nav" data-screen="access-ended">
  <div class="main g-ended">
    <header class="top"><button type="button" class="icon-btn" aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button></header>
    <div class="g-ended-body">
      <h1 class="h1">Пробный период закончился</h1>
      <p class="lead">Чтобы начать тренировку, продлите подписку. Всё, что вы сделали, на месте — продолжите с того же вопроса.</p>
      <ul class="g-saved" role="list">
        <li><svg class="ic-sm"><use href="#i-check"/></svg>Прогресс и история — 214 ответов</li>
        <li><svg class="ic-sm"><use href="#i-check"/></svg>Слова и повторение</li>
        <li><svg class="ic-sm"><use href="#i-check"/></svg>Эссе и их оценки</li>
      </ul>
    </div>
    <footer class="bottom-bar g-ended-cta">
      <button type="button" class="btn btn-primary btn-wide">Продлить — [ЦЕНА] в месяц</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'G6', group: 'G', name: 'Прогресс — пока пусто', html: `
<div class="app has-nav" data-screen="stats-empty">
  ${NS.nav('progress')}
  <div class="main g-empty">
    ${NS.top()}
    ${gTitle('Прогресс')}
    <section class="g-empty-card">
      <h2 class="h2">Здесь появится ваш прогресс</h2>
      <p>После первой тренировки покажем, какие типы заданий получаются, а какие стоит потренировать. После пробника — примерный балл.</p>
      <ul class="g-ghost" aria-hidden="true">
        <li><span class="g-ghost-name">Text Completion</span><span class="g-ghost-bar"></span><span class="g-ghost-val">— %</span></li>
        <li><span class="g-ghost-name">Sentence Equivalence</span><span class="g-ghost-bar"></span><span class="g-ghost-val">— %</span></li>
        <li><span class="g-ghost-name">Quantitative Comparison</span><span class="g-ghost-bar"></span><span class="g-ghost-val">— %</span></li>
      </ul>
      <button type="button" class="btn btn-primary btn-wide">Первая тренировка · ~12 мин</button>
    </section>
  </div>
</div>
` });

// Вся история: по дням, фильтр по разделу. Пробники — в той же ленте.
NS.add({ id: 'G7', group: 'G', name: 'Вся история', html: `
<div class="app has-nav" data-screen="history">
  ${NS.nav('progress')}
  <div class="main scroll g-history">
    ${gBack('Прогресс')}
    <h1 class="h1">История</h1>
    <div class="seg g-filter" role="group" aria-label="Раздел">
      <button type="button" aria-pressed="true">Все</button><button type="button" aria-pressed="false">Verbal</button><button type="button" aria-pressed="false">Quant</button><button type="button" aria-pressed="false">Эссе</button><button type="button" aria-pressed="false">Пробники</button>
    </div>
    <section class="g-day">
      <h2 class="g-day-title">Сегодня</h2>
      <ul class="hist" role="list">
        <li><a href="#" class="hist-row g-hist-link sec-verbal"><span class="sec-dot"></span><span class="hist-main"><b>Text Completion</b><small>14:20 · Практика · 12 мин</small></span><span class="hist-res">8/10</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
      </ul>
    </section>
    <section class="g-day">
      <h2 class="g-day-title">Вчера</h2>
      <ul class="hist" role="list">
        <li><a href="#" class="hist-row g-hist-link sec-quant"><span class="sec-dot"></span><span class="hist-main"><b>Quantitative Comparison</b><small>21:05 · Проверка · 15 мин</small></span><span class="hist-res">13/15</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
        <li><a href="#" class="hist-row g-hist-link sec-essay"><span class="sec-dot"></span><span class="hist-main"><b>Эссе · Analyze an Issue</b><small>19:40 · 30 мин</small></span><span class="hist-res">4,5 из 6</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
      </ul>
    </section>
    <section class="g-day">
      <h2 class="g-day-title">2 октября</h2>
      <ul class="hist" role="list">
        <li><a href="#" class="hist-row g-hist-link sec-exam"><span class="sec-dot"></span><span class="hist-main"><b>Пробный экзамен 1</b><small>10:00 · полный · 1 ч 58 мин</small></span><span class="hist-res">V 154 · Q 160</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
      </ul>
    </section>
    <section class="g-day">
      <h2 class="g-day-title">1 октября</h2>
      <ul class="hist" role="list">
        <li><a href="#" class="hist-row g-hist-link sec-verbal"><span class="sec-dot"></span><span class="hist-main"><b>Reading Comprehension</b><small>18:30 · Практика · 18 мин</small></span><span class="hist-res">5/10</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
        <li><a href="#" class="hist-row g-hist-link sec-quant"><span class="sec-dot"></span><span class="hist-main"><b>Задачи</b><small>08:15 · Практика · 14 мин</small></span><span class="hist-res">7/10</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>
      </ul>
    </section>
  </div>
</div>
` });

// Тренировка из истории: итог и вопросы; строка открывает разбор вопроса.
const gQ = (n, ok, topic, opened = '') => `<li><a href="#" class="g-q${opened}"><span class="g-q-num">${n}</span><span class="g-q-mark ${ok ? 'g-q-right' : 'g-q-wrong'}"><svg class="ic-sm"><use href="#${ok ? 'i-check' : 'i-cross'}"/></svg><span class="g-sr">${ok ? 'верно' : 'неверно'}</span></span><span class="g-q-topic">${topic}</span><svg class="ic-sm g-chev"><use href="#i-chevron-right"/></svg></a></li>`;
NS.add({ id: 'G8', group: 'G', name: 'Тренировка из истории', html: `
<div class="app has-nav" data-screen="history-item">
  ${NS.nav('progress')}
  <div class="main scroll g-item">
    ${gBack('История')}
    <div class="g-item-grid">
      <section class="g-item-head sec-verbal">
        <h1 class="h1">Text Completion</h1>
        <p class="g-item-meta"><span class="sec-dot"></span>Verbal · Сегодня, 14:20 · Практика · 12 мин</p>
        <p class="g-item-score"><span class="g-item-num">8</span><span class="g-item-of">из 10 верно</span></p>
        <ol class="g-dots" aria-label="Ответы по порядку: 8 верно, 2 неверно">
          <li class="g-dot-r"></li><li class="g-dot-r"></li><li class="g-dot-w"></li><li class="g-dot-r"></li><li class="g-dot-r"></li><li class="g-dot-r"></li><li class="g-dot-w"></li><li class="g-dot-r"></li><li class="g-dot-r"></li><li class="g-dot-r"></li>
        </ol>
        <div class="g-topics">
          <h2 class="h3">Темы</h2>
          <p class="g-topic"><span>Контраст после <i lang="en">although</i></span><b>2 из 4</b></p>
          <p class="g-topic"><span>Причина и следствие</span><b>3 из 3</b></p>
          <p class="g-topic"><span>Оценочная лексика</span><b>3 из 3</b></p>
        </div>
        <button type="button" class="btn btn-primary btn-wide g-item-cta">Повторить ошибки · 2 вопроса</button>
      </section>
      <section class="g-qs">
        <h2 class="h3">Вопросы</h2>
        <ol class="g-q-list" role="list">
          ${gQ(1, true, 'Причина и следствие')}
          ${gQ(2, true, 'Оценочная лексика')}
          ${gQ(3, false, 'Контраст после <i lang="en">although</i>')}
          ${gQ(4, true, 'Причина и следствие')}
          ${gQ(5, true, 'Контраст после <i lang="en">although</i>')}
          ${gQ(6, true, 'Оценочная лексика')}
          ${gQ(7, false, 'Контраст после <i lang="en">although</i>')}
          ${gQ(8, true, 'Причина и следствие')}
          ${gQ(9, true, 'Оценочная лексика')}
          ${gQ(10, true, 'Контраст после <i lang="en">although</i>')}
        </ol>
      </section>
    </div>
  </div>
</div>
` });
