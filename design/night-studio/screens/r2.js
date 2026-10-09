// Группа R, часть 2: Quant с несколькими ответами, ввод числа и дроби, данные, калькулятор, «Проверка» на время,
// итог, разбор «Проверки», «Сообщить об ошибке», теория. Стили — screens/r2.css на токенах core.css.

NS.icon('i-r2-calc', '<rect x="5" y="3" width="14" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
NS.icon('i-r2-clock', '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');

// Шапка сессии: раздел и тип, счётчик, полоса. timer — для «Проверки».
const r2Top = (sec, label, n, total, timer = '') => `
    <header class="session-top sec-${sec}">
      <button type="button" class="icon-btn" aria-label="Закрыть тренировку"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>${label}</span>
        <span class="r2-meta-end">${timer ? `<span class="r2-timer" role="timer" aria-label="Осталось ${timer}"><svg class="ic-sm"><use href="#i-r2-clock"/></svg>${timer}</span>` : ''}<span class="session-count">${n} из ${total}</span></span>
      </div>
      <div class="session-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${n - 1}" aria-label="Пройдено ${n - 1} из ${total}"><span style="width:${((n - 1) / total) * 100}%"></span></div>
    </header>`;

const r2Calc = `<button type="button" class="r2-calc-btn" aria-label="Калькулятор"><svg class="ic-sm"><use href="#i-r2-calc"/></svg>Калькулятор</button>`;

// Вопрос R11 — и сам экран, и подложка под калькулятором R13.
const r2Numeric = (withSheet) => `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r2Top('quant', 'Quant · Ввод числа', 7, 10)}
    <div class="q-layout">
      <section class="q-stem">
        <div class="r2-instr-row"><p class="q-instr">Введите ответ.</p>${r2Calc}</div>
        <p class="q-text">A store sells pens for $1.25 each and notebooks for $3.40 each. Mira buys 6 pens and 4 notebooks. How much does she spend, in dollars?</p>
      </section>
      <section class="q-answers">
        <label class="r2-field" for="r2-num${withSheet ? '-c' : ''}">
          <span class="r2-field-label">Ответ</span>
          <span class="r2-field-box"><span class="r2-unit" aria-hidden="true">$</span><input id="r2-num${withSheet ? '-c' : ''}" type="text" inputmode="decimal" value="21.10" autocomplete="off"></span>
        </label>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
  ${withSheet ? `
  <div class="scrim"></div>
  <section class="sheet r2-calc" role="dialog" aria-label="Калькулятор">
    <div class="r2-calc-head">
      <h2 class="h2">Калькулятор</h2>
      <button type="button" class="icon-btn r2-sheet-close" aria-label="Закрыть калькулятор"><svg class="ic"><use href="#i-close"/></svg></button>
    </div>
    <output class="r2-display" aria-live="polite"><span class="r2-mem">M</span>21.1</output>
    <div class="r2-keys">
      <button type="button" class="r2-key r2-key-fn r2-key-wide">Transfer Display</button>
      <button type="button" class="r2-key r2-key-fn">MR</button>
      <button type="button" class="r2-key r2-key-fn">MC</button>
      <button type="button" class="r2-key r2-key-fn">M+</button>
      <button type="button" class="r2-key r2-key-fn">(</button>
      <button type="button" class="r2-key r2-key-fn">)</button>
      <button type="button" class="r2-key">7</button>
      <button type="button" class="r2-key">8</button>
      <button type="button" class="r2-key">9</button>
      <button type="button" class="r2-key r2-key-op" aria-label="Разделить">÷</button>
      <button type="button" class="r2-key r2-key-op" aria-label="Квадратный корень">√</button>
      <button type="button" class="r2-key">4</button>
      <button type="button" class="r2-key">5</button>
      <button type="button" class="r2-key">6</button>
      <button type="button" class="r2-key r2-key-op" aria-label="Умножить">×</button>
      <button type="button" class="r2-key r2-key-op" aria-label="Сменить знак">±</button>
      <button type="button" class="r2-key">1</button>
      <button type="button" class="r2-key">2</button>
      <button type="button" class="r2-key">3</button>
      <button type="button" class="r2-key r2-key-op" aria-label="Вычесть">−</button>
      <button type="button" class="r2-key r2-key-fn">CE</button>
      <button type="button" class="r2-key">0</button>
      <button type="button" class="r2-key">.</button>
      <button type="button" class="r2-key r2-key-op">=</button>
      <button type="button" class="r2-key r2-key-op" aria-label="Сложить">+</button>
      <button type="button" class="r2-key r2-key-fn">C</button>
    </div>
  </section>` : ''}
</div>`;

NS.add({ id: 'R10', group: 'R', name: 'Quant — несколько ответов, до проверки', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r2Top('quant', 'Quant · Несколько ответов', 6, 10)}
    <div class="q-layout">
      <section class="q-stem">
        <div class="r2-instr-row"><p class="q-instr">Выберите все подходящие варианты.</p>${r2Calc}</div>
        <p class="q-text">x is an integer, and 3 &lt; x² &lt; 30. Which of the following could be the value of x?</p>
      </section>
      <section class="q-answers">
        <fieldset class="opt-group r2-multi">
          <legend class="r2-sr">Варианты</legend>
          <button type="button" class="opt" role="checkbox" aria-checked="false"><span class="oval r2-box"><svg class="r2-tick"><use href="#i-check"/></svg></span>−5</button>
          <button type="button" class="opt" role="checkbox" aria-checked="true"><span class="oval r2-box"><svg class="r2-tick"><use href="#i-check"/></svg></span>−4</button>
          <button type="button" class="opt" role="checkbox" aria-checked="false"><span class="oval r2-box"><svg class="r2-tick"><use href="#i-check"/></svg></span>−1</button>
          <button type="button" class="opt" role="checkbox" aria-checked="false"><span class="oval r2-box"><svg class="r2-tick"><use href="#i-check"/></svg></span>2</button>
          <button type="button" class="opt" role="checkbox" aria-checked="true"><span class="oval r2-box"><svg class="r2-tick"><use href="#i-check"/></svg></span>5</button>
          <button type="button" class="opt" role="checkbox" aria-checked="false"><span class="oval r2-box"><svg class="r2-tick"><use href="#i-check"/></svg></span>6</button>
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

NS.add({ id: 'R11', group: 'R', name: 'Quant — ввод числа', html: r2Numeric(false) });

NS.add({ id: 'R11b', group: 'R', name: 'Quant — ввод дробью', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r2Top('quant', 'Quant · Ввод числа', 8, 10)}
    <div class="q-layout">
      <section class="q-stem">
        <div class="r2-instr-row"><p class="q-instr">Введите ответ дробью. Сокращать не нужно.</p>${r2Calc}</div>
        <p class="q-text">A bag holds 4 red, 6 blue and 5 green marbles. One marble is drawn at random. What is the probability that it is not blue?</p>
      </section>
      <section class="q-answers">
        <div class="r2-frac" role="group" aria-label="Ответ дробью">
          <label class="r2-field" for="r2-frac-top"><span class="r2-field-label">Числитель</span><span class="r2-field-box"><input id="r2-frac-top" type="text" inputmode="numeric" value="9" autocomplete="off"></span></label>
          <span class="r2-frac-line" aria-hidden="true"></span>
          <label class="r2-field" for="r2-frac-bottom"><span class="r2-field-label">Знаменатель</span><span class="r2-field-box"><input id="r2-frac-bottom" type="text" inputmode="numeric" value="15" autocomplete="off"></span></label>
        </div>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'R12', group: 'R', name: 'Quant — данные на графике', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r2Top('quant', 'Quant · Data Interpretation', 9, 10)}
    <div class="q-layout scroll r2-scroll">
      <section class="q-stem">
        <div class="r2-instr-row"><p class="q-instr">Ответьте по графику.</p>${r2Calc}</div>
        <figure class="r2-chart">
          <figcaption>New subscribers to an online course, January–May (thousands)</figcaption>
          <svg viewBox="0 0 320 172" role="img" aria-label="Столбчатая диаграмма: январь 12, февраль 18, март 15, апрель 24, май 30 тысяч">
            <g class="r2-grid">
              <line x1="34" y1="140" x2="312" y2="140"/>
              <line x1="34" y1="104" x2="312" y2="104"/>
              <line x1="34" y1="68" x2="312" y2="68"/>
              <line x1="34" y1="32" x2="312" y2="32"/>
            </g>
            <g class="r2-axis">
              <text x="26" y="144" text-anchor="end">0</text>
              <text x="26" y="108" text-anchor="end">10</text>
              <text x="26" y="72" text-anchor="end">20</text>
              <text x="26" y="36" text-anchor="end">30</text>
            </g>
            <g class="r2-bars">
              <rect x="48" y="96.8" width="34" height="43.2" rx="4"/>
              <rect x="103" y="75.2" width="34" height="64.8" rx="4"/>
              <rect x="158" y="86" width="34" height="54" rx="4"/>
              <rect x="213" y="53.6" width="34" height="86.4" rx="4"/>
              <rect x="268" y="32" width="34" height="108" rx="4"/>
            </g>
            <g class="r2-vals">
              <text x="65" y="90">12</text><text x="120" y="69">18</text><text x="175" y="80">15</text><text x="230" y="47">24</text><text x="285" y="26">30</text>
            </g>
            <g class="r2-axis r2-months">
              <text x="65" y="160">Jan</text><text x="120" y="160">Feb</text><text x="175" y="160">Mar</text><text x="230" y="160">Apr</text><text x="285" y="160">May</text>
            </g>
          </svg>
        </figure>
        <p class="q-text r2-q-short">By approximately what percent did the number of new subscribers increase from March to May?</p>
      </section>
      <section class="q-answers">
        <fieldset class="opt-group">
          <legend class="r2-sr">Варианты</legend>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>50%</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>67%</button>
          <button type="button" class="opt" role="radio" aria-checked="true"><span class="oval"></span>100%</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>150%</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>200%</button>
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

NS.add({ id: 'R13', group: 'R', name: 'Калькулятор поверх вопроса', html: r2Numeric(true) });

NS.add({ id: 'R14', group: 'R', name: '«Проверка» — на время, без разбора', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r2Top('verbal', 'Verbal · Проверка', 5, 12, '12:40')}
    <div class="q-layout">
      <section class="q-stem">
        <p class="q-instr">Выберите один вариант для пропуска.</p>
        <p class="q-text">The scientist’s findings, far from being <span class="blank">&nbsp;</span>, were confirmed by three independent laboratories within a year.</p>
      </section>
      <section class="q-answers">
        <fieldset class="opt-group">
          <legend class="r2-sr">Варианты</legend>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>celebrated</button>
          <button type="button" class="opt" role="radio" aria-checked="true"><span class="oval"></span>spurious</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>replicable</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>influential</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>conclusive</button>
        </fieldset>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Дальше</button>
    </footer>
  </div>
</div>
` });

// Итог: 10 отметок по порядку вопросов; неверные — 3, 6 и 9 (согласовано с «7 из 10»).
const r2Marks = [1, 1, 0, 1, 1, 0, 1, 1, 0, 1].map((ok, i) =>
  `<li class="r2-mark ${ok ? 'r2-mark-ok' : 'r2-mark-no'}"><span class="r2-sr">Вопрос ${i + 1}: ${ok ? 'верно' : 'неверно'}</span><svg class="ic-sm" aria-hidden="true"><use href="#${ok ? 'i-check' : 'i-cross'}"/></svg></li>`).join('');

NS.add({ id: 'R15', group: 'R', name: 'Итог тренировки', html: `
<div class="app no-nav" data-screen="summary">
  <div class="main r2-summary">
    <header class="top">
      <button type="button" class="icon-btn" aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
    </header>
    <div class="r2-sum-layout">
      <section class="r2-sum-head sec-verbal">
        <p class="r2-sum-sub"><span class="sec-dot"></span>Verbal · Text Completion · Практика · 14 мин</p>
        <h1 class="r2-score"><span class="r2-score-num">7</span><span class="r2-score-of">из 10 верно</span></h1>
        <ol class="r2-marks" aria-label="Ответы по порядку">${r2Marks}</ol>
      </section>
      <section class="r2-repeat">
        <h2 class="h2">Что повторить</h2>
        <ul class="r2-topics" role="list">
          <li><a href="#" class="r2-topic"><span><b>Слова-сигналы контраста</b><small>2 ошибки · although, yet, far from</small></span><svg class="ic-sm"><use href="#i-chevron-right"/></svg></a></li>
          <li><a href="#" class="r2-topic"><span><b>Оценочная лексика</b><small>1 ошибка · похвала или критика</small></span><svg class="ic-sm"><use href="#i-chevron-right"/></svg></a></li>
        </ul>
        <p class="r2-note">Неверные задания уже в «Повторить мои ошибки».</p>
      </section>
    </div>
    <footer class="bottom-bar r2-stack">
      <button type="button" class="btn btn-primary">Тренировка по ним · 8 вопросов</button>
      <button type="button" class="btn btn-ghost">Готово</button>
    </footer>
  </div>
</div>
` });

// Разбор «Проверки»: 12 вопросов Verbal вперемешку, 8 верно, 4 неверно.
const r2Rows = [
  [1, 'Text Completion', 1, 'Слова-сигналы контраста'],
  [2, 'Sentence Equivalence', 1, 'Оценочная лексика'],
  [3, 'Reading Comprehension', 0, 'Вывод из текста'],
  [4, 'Text Completion', 1, 'Причина и следствие'],
  [5, 'Text Completion', 0, 'Слова-сигналы контраста'],
  [6, 'Sentence Equivalence', 1, 'Синонимы в контексте'],
  [7, 'Reading Comprehension', 1, 'Главная мысль'],
  [8, 'Reading Comprehension', 0, 'Вывод из текста'],
  [9, 'Text Completion', 1, 'Оценочная лексика'],
  [10, 'Sentence Equivalence', 0, 'Синонимы в контексте'],
  [11, 'Text Completion', 1, 'Причина и следствие'],
  [12, 'Reading Comprehension', 1, 'Структура абзаца'],
].map(([n, type, ok, topic]) => `
          <li><a href="#" class="r2-row">
            <span class="r2-row-n">${n}</span>
            <span class="r2-row-main"><b>${type}</b><small>${topic}</small></span>
            <span class="r2-row-res ${ok ? 'r2-res-ok' : 'r2-res-no'}"><svg class="ic-sm" aria-hidden="true"><use href="#${ok ? 'i-check' : 'i-cross'}"/></svg>${ok ? 'верно' : 'неверно'}</span>
            <svg class="ic-sm r2-row-chev" aria-hidden="true"><use href="#i-chevron-right"/></svg>
          </a></li>`).join('');

NS.add({ id: 'R16', group: 'R', name: 'Разбор после «Проверки»', html: `
<div class="app no-nav" data-screen="check-review">
  <div class="main">
    <header class="top top-back">
      <button type="button" class="icon-btn" aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      <span class="top-title">Verbal · Проверка</span>
    </header>
    <section class="r2-check-head">
      <h1 class="r2-score r2-score-sm"><span class="r2-score-num">8</span><span class="r2-score-of">из 12 · 17 мин</span></h1>
      <p class="r2-note">Время вышло на 12-м вопросе — все ответы засчитаны.</p>
    </section>
    <ul class="r2-list scroll" role="list">${r2Rows}
    </ul>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Повторить ошибки · 4 вопроса</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'R17', group: 'R', name: 'Сообщить об ошибке — шторка', html: `
<div class="app no-nav" data-screen="review" data-lang="ru">
  <div class="main">
    ${r2Top('verbal', 'Verbal · Text Completion', 3, 10)}
    <div class="r-layout">
      <section class="r-question">
        <div class="verdict verdict-wrong" role="status">
          <svg class="ic"><use href="#i-cross"/></svg>
          <span><b>Неверно</b> — первый пропуск верно, второй нет.</span>
        </div>
      </section>
      <section class="r-explain">
        <div class="explain-body" data-lang-block="ru">
          <p>«Brevity came at a cost» и «dismissed in a single sentence» говорят, что возражения разобрали наспех.</p>
        </div>
      </section>
    </div>
  </div>
  <div class="scrim"></div>
  <section class="sheet r2-report" role="dialog" aria-labelledby="r2-report-title">
    <div class="r2-calc-head">
      <h2 class="h2" id="r2-report-title">Что не так с заданием?</h2>
      <button type="button" class="icon-btn r2-sheet-close" aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
    </div>
    <div class="r2-chips" role="radiogroup" aria-label="Где ошибка">
      <button type="button" class="r2-chip" role="radio" aria-checked="false">В задании</button>
      <button type="button" class="r2-chip" role="radio" aria-checked="false">В ответе</button>
      <button type="button" class="r2-chip" role="radio" aria-checked="true">В разборе</button>
      <button type="button" class="r2-chip" role="radio" aria-checked="false">Перевод</button>
      <button type="button" class="r2-chip" role="radio" aria-checked="false">Другое</button>
    </div>
    <label class="r2-area" for="r2-report-text">
      <span class="r2-field-label">Комментарий, если хотите</span>
      <textarea id="r2-report-text" rows="3">В английском разборе perfunctory переведено иначе, чем в русском.</textarea>
    </label>
    <button type="button" class="btn btn-primary btn-wide">Отправить</button>
  </section>
</div>
` });

NS.add({ id: 'R18', group: 'R', name: 'Теория: слова-сигналы контраста', html: `
<div class="app no-nav" data-screen="theory" data-lang="ru">
  <div class="main">
    <header class="top top-back">
      <button type="button" class="icon-btn" aria-label="Назад к разбору"><svg class="ic"><use href="#i-back"/></svg></button>
      <span class="top-title">Теория</span>
      <div class="seg r2-top-seg" role="group" aria-label="Язык">
        <button type="button" data-lang-set="ru" aria-pressed="true">RU</button>
        <button type="button" data-lang-set="en" aria-pressed="false">EN</button>
      </div>
    </header>
    <article class="r2-theory scroll sec-verbal">
      <div data-lang-block="ru" class="r2-theory-body">
        <header class="r2-th-head">
          <p class="r2-sum-sub"><span class="sec-dot"></span>Verbal · Text Completion</p>
          <h1 class="h1">Слова-сигналы контраста</h1>
        </header>
        <p class="r2-lead">Although, yet, far from, despite показывают, что вторая часть предложения спорит с первой. Значит, слово в пропуске — противоположность тому, что сказано рядом.</p>
        <section class="r2-th-sec">
          <h2 class="h3">Приём</h2>
          <p>Найдите сигнал и подставьте в пропуск своё слово, противоположное соседней части. Только потом смотрите варианты.</p>
        </section>
        <section class="r2-th-sec">
          <h2 class="h3">Ловушки</h2>
          <ul class="r2-bullets" role="list">
            <li>Вариант, который «звучит хорошо», но не спорит с первой частью.</li>
            <li>Двойное отрицание: far from + неудача = успех.</li>
          </ul>
        </section>
        <section class="r2-th-sec">
          <h2 class="h3">Примеры</h2>
          <div class="r2-ex"><p>Although the novelist was once dismissed as a minor talent, her later books earned her a reputation as a <b>major</b> voice.</p><p class="r2-ex-ru">Сигнал although: «второстепенный» → нужно противоположное — «крупный».</p></div>
          <div class="r2-ex"><p>The data seemed conclusive at first; on closer inspection, however, they proved surprisingly <b>ambiguous</b>.</p><p class="r2-ex-ru">Сигнал however: «убедительные» → «неоднозначные».</p></div>
        </section>
      </div>
      <div data-lang-block="en" class="r2-theory-body">
        <header class="r2-th-head">
          <p class="r2-sum-sub"><span class="sec-dot"></span>Verbal · Text Completion</p>
          <h1 class="h1">Contrast signal words</h1>
        </header>
        <p class="r2-lead">Although, yet, far from and despite tell you that the second half of the sentence pushes against the first. The blank needs the opposite of what surrounds it.</p>
        <section class="r2-th-sec">
          <h2 class="h3">Technique</h2>
          <p>Find the signal and fill the blank with your own word that opposes the other half. Only then look at the choices.</p>
        </section>
        <section class="r2-th-sec">
          <h2 class="h3">Traps</h2>
          <ul class="r2-bullets" role="list">
            <li>A choice that sounds right but doesn’t oppose the first half.</li>
            <li>Double negatives: far from + failure = success.</li>
          </ul>
        </section>
        <section class="r2-th-sec">
          <h2 class="h3">Examples</h2>
          <div class="r2-ex"><p>Although the novelist was once dismissed as a minor talent, her later books earned her a reputation as a <b>major</b> voice.</p><p class="r2-ex-ru">Signal although: “minor” → the opposite, “major”.</p></div>
          <div class="r2-ex"><p>The data seemed conclusive at first; on closer inspection, however, they proved surprisingly <b>ambiguous</b>.</p><p class="r2-ex-ru">Signal however: “conclusive” → “ambiguous”.</p></div>
        </section>
      </div>
    </article>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Тренировка по теме · 8 вопросов</button>
    </footer>
  </div>
</div>
` });
