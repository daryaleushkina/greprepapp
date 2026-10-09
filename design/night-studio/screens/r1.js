// Группа R. Экраны регистрируются через NS.add; разметка — внутри .app, стили — screens/r1.css на токенах core.css.

NS.add({ id: 'R3', group: 'R', name: 'Text Completion — до проверки', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    <header class="session-top sec-verbal">
      <button type="button" class="icon-btn" aria-label="Закрыть тренировку"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>Verbal · Text Completion</span>
        <span class="session-count">3 из 10</span>
      </div>
      <div class="session-bar" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="2" aria-label="Пройдено 2 из 10"><span style="width:20%"></span></div>
    </header>
    <div class="q-layout">
      <section class="q-stem">
        <p class="q-instr">Выберите по одному варианту для каждого пропуска.</p>
        <p class="q-text">Although the committee’s report was praised for its <span class="blank">(i)</span>, critics noted that its brevity came at a cost: several crucial objections were dismissed in a single <span class="blank">(ii)</span> sentence.</p>
      </section>
      <section class="q-answers">
        <fieldset class="opt-group">
          <legend>Пропуск (i)</legend>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>thoroughness</button>
          <button type="button" class="opt" role="radio" aria-checked="true"><span class="oval"></span>concision</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>candor</button>
        </fieldset>
        <fieldset class="opt-group">
          <legend>Пропуск (ii)</legend>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>perfunctory</button>
          <button type="button" class="opt" role="radio" aria-checked="true"><span class="oval"></span>meticulous</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>impassioned</button>
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

NS.add({ id: 'R4', group: 'R', name: 'Text Completion — неверно, разбор', html: `
<div class="app no-nav" data-screen="review" data-lang="ru">
  <div class="main">
    <header class="session-top sec-verbal">
      <button type="button" class="icon-btn" aria-label="Закрыть тренировку"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>Verbal · Text Completion</span>
        <span class="session-count">3 из 10</span>
      </div>
      <div class="session-bar" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="3" aria-label="Пройдено 3 из 10"><span style="width:30%"></span></div>
    </header>
    <div class="r-layout">
      <section class="r-question">
        <div class="verdict verdict-wrong" role="status">
          <svg class="ic"><use href="#i-cross"/></svg>
          <span><b>Неверно</b> — первый пропуск верно, второй нет.</span>
        </div>
        <p class="q-text q-text-sm">Although the committee’s report was praised for its <span class="blank blank-right">concision</span>, critics noted that its brevity came at a cost: several crucial objections were dismissed in a single <span class="blank blank-wrong">meticulous</span> sentence.</p>
        <dl class="answer-table">
          <div class="ans-row">
            <dt>Пропуск (i)</dt>
            <dd><span class="ans ans-right"><svg class="ic-sm"><use href="#i-check"/></svg>concision</span></dd>
          </div>
          <div class="ans-row">
            <dt>Пропуск (ii)</dt>
            <dd>
              <span class="ans ans-wrong"><svg class="ic-sm"><use href="#i-cross"/></svg>meticulous<small>ваш ответ</small></span>
              <span class="ans ans-right"><svg class="ic-sm"><use href="#i-check"/></svg>perfunctory<small>верно</small></span>
            </dd>
          </div>
        </dl>
      </section>
      <section class="r-explain">
        <div class="explain-head">
          <h2 class="h2">Perfunctory — «для галочки»</h2>
          <div class="seg" role="group" aria-label="Язык разбора">
            <button type="button" data-lang-set="ru" aria-pressed="true">RU</button>
            <button type="button" data-lang-set="en" aria-pressed="false">EN</button>
          </div>
        </div>
        <div class="explain-body" data-lang-block="ru">
          <p>«Brevity came at a cost» и «dismissed in a single sentence» говорят, что возражения разобрали наспех. Нужно слово с оттенком «для галочки».</p>
          <p><b>Perfunctory</b> — сделанный формально, поверхностно. Это и есть цена краткости.</p>
          <p class="trap"><b>Почему соблазняет meticulous.</b> Звучит как похвала отчёту, но «скрупулёзный» противоречит «dismissed»: тщательно возражения не отбрасывают.</p>
        </div>
        <div class="explain-body" data-lang-block="en">
          <p>“Brevity came at a cost” and “dismissed in a single sentence” signal that the objections were handled hastily. The blank needs a word meaning “done only as a formality.”</p>
          <p><b>Perfunctory</b> — carried out with minimal effort. That is the cost of brevity.</p>
          <p class="trap"><b>Why meticulous tempts.</b> It sounds like praise for the report, but “meticulous” clashes with “dismissed”: careful work doesn’t brush objections aside.</p>
        </div>
        <a href="#" class="topic-link"><svg class="ic-sm"><use href="#i-book"/></svg><span>Тема: контраст после <i>although</i></span><svg class="ic-sm"><use href="#i-chevron-right"/></svg></a>
        <a href="#" class="report-link"><svg class="ic-sm"><use href="#i-flag"/></svg>Сообщить об ошибке</a>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Дальше</button>
    </footer>
  </div>
</div>
` });

// ---------- Общие куски группы ----------
// Верх сессии: раздел · тип, «n из total», полоса пройденного (n − 1 вопросов уже позади).
const r1Top = (sec, label, n, total = 10) => `
    <header class="session-top r1-top sec-${sec}">
      <button type="button" class="icon-btn" aria-label="Закрыть тренировку"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>${label}</span>
        <span class="session-count">${n} из ${total}</span>
      </div>
      <div class="session-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${n - 1}" aria-label="Пройдено ${n - 1} из ${total}"><span style="width:${((n - 1) / total) * 100}%"></span></div>
    </header>`;
const r1Radio = (text, on = false, extra = '') =>
  `<button type="button" class="opt${extra}" role="radio" aria-checked="${on}"><span class="oval"></span>${text}</button>`;
const r1Check = (text, on = false, extra = '') =>
  `<button type="button" class="opt r1-opt-box${extra}" role="checkbox" aria-checked="${on}"><span class="r1-box"><svg class="ic-sm"><use href="#i-check"/></svg></span>${text}</button>`;

NS.icon('i-r1-calc', '<rect x="5" y="3" width="14" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
NS.icon('i-r1-mark', '<path d="M7 4h10a1 1 0 011 1v15l-6-4-6 4V5a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>');

// Общий текст Reading Comprehension (свой, научно-популярный) — R7 и R8.
const R1_PASSAGE = [
  'For decades, ecologists assumed that the deep ocean floor was nearly static, receiving only a slow drizzle of organic debris from the surface.',
  'Long-term camera studies have complicated that picture.',
  'At one site off California, researchers recorded sudden pulses of sinking material—so-called marine snow—that arrived within weeks of surface plankton blooms.',
  'During these pulses, populations of sea cucumbers and other deposit feeders shifted noticeably, suggesting that the seafloor community responds to events far above it with surprising speed.',
  'The findings do not mean that the abyss is as dynamic as a coastal reef; most of the time, change there remains slow.',
  'But they imply that models treating the deep sea as a buffered, unchanging system may underestimate how quickly it reacts to warming at the surface.',
];

NS.add({ id: 'R1', group: 'R', name: 'Новая тренировка — конструктор', html: `
<div class="app no-nav" data-screen="builder">
  <div class="main">
    <header class="top top-back">
      <button type="button" class="icon-btn" aria-label="Назад к тренировке"><svg class="ic"><use href="#i-back"/></svg></button>
    </header>
    <h1 class="h1 r1-title">Новая тренировка</h1>
    <div class="r1-builder scroll">
      <div class="r1-presets" role="radiogroup" aria-label="Готовые наборы">
        <button type="button" class="r1-preset sec-verbal" role="radio" aria-checked="true">
          <span class="oval"></span>
          <span class="r1-preset-body"><b>Как в прошлый раз</b><small>Verbal · Text Completion · 10 · Практика</small></span>
        </button>
        <button type="button" class="r1-preset" role="radio" aria-checked="false">
          <span class="oval"></span>
          <span class="r1-preset-body"><b>Повторить мои ошибки</b><small>12 заданий из прошлых тренировок</small></span>
        </button>
        <button type="button" class="r1-preset sec-verbal" role="radio" aria-checked="false">
          <span class="oval"></span>
          <span class="r1-preset-body"><b>Слабое место: Inference</b><small>Reading Comprehension · 52 % верно</small></span>
        </button>
        <button type="button" class="r1-preset" role="radio" aria-checked="false">
          <span class="oval"></span>
          <span class="r1-preset-body"><b>Проверка на время</b><small>Verbal · все типы · 12 вопросов · 18 мин</small></span>
        </button>
      </div>

      <div class="r1-form">
        <div class="r1-field">
          <span class="r1-label" id="r1-sec-l">Раздел</span>
          <div class="seg r1-seg" role="group" aria-labelledby="r1-sec-l">
            <button type="button" aria-pressed="true">Verbal</button>
            <button type="button" aria-pressed="false">Quant</button>
            <button type="button" aria-pressed="false">Эссе</button>
          </div>
        </div>
        <a href="#" class="r1-row"><span class="r1-label">Тип</span><span class="r1-row-val">Text Completion</span><svg class="ic-sm r1-chev"><use href="#i-chevron-right"/></svg></a>
        <label class="r1-row r1-row-num" for="r1-count"><span class="r1-label">Вопросов</span><input id="r1-count" class="r1-num" type="number" inputmode="numeric" min="1" max="50" value="10"></label>
        <div class="r1-field">
          <span class="r1-label" id="r1-mode-l">Режим</span>
          <div class="seg r1-seg" role="group" aria-labelledby="r1-mode-l">
            <button type="button" aria-pressed="true">Практика</button>
            <button type="button" aria-pressed="false">Проверка</button>
          </div>
          <p class="r1-hint">Разбор сразу после каждого вопроса, без таймера.</p>
        </div>
        <a href="#" class="r1-row"><span class="r1-label">Темы и сложность</span><span class="r1-row-val">все</span><svg class="ic-sm r1-chev"><use href="#i-chevron-right"/></svg></a>
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Начать · 10 вопросов · ~12 мин</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'R2', group: 'R', name: 'Темы и сложность', html: `
<div class="app no-nav" data-screen="builder-topics">
  <div class="main">
    <header class="top top-back">
      <button type="button" class="icon-btn" aria-label="Назад к конструктору"><svg class="ic"><use href="#i-back"/></svg></button>
    </header>
    <div class="r1-topics-head">
      <h1 class="h1 r1-title">Темы и сложность</h1>
      <p class="r1-sub"><span class="sec-dot sec-verbal"></span>Verbal · Text Completion · подходит 118 заданий</p>
    </div>
    <div class="r1-topics-grid scroll">
      <ul class="r1-topics" role="list">
        <li><label class="r1-switch-row"><span class="r1-topic"><b>Контраст и уступка</b><small><i lang="en">although, yet, despite</i> · 24</small></span><button type="button" class="r1-switch" role="switch" aria-checked="true" aria-label="Контраст и уступка"></button></label></li>
        <li><label class="r1-switch-row"><span class="r1-topic"><b>Причина и следствие</b><small><i lang="en">because, thus, hence</i> · 19</small></span><button type="button" class="r1-switch" role="switch" aria-checked="true" aria-label="Причина и следствие"></button></label></li>
        <li><label class="r1-switch-row"><span class="r1-topic"><b>Продолжение мысли</b><small><i lang="en">moreover, indeed</i> · 17</small></span><button type="button" class="r1-switch" role="switch" aria-checked="true" aria-label="Продолжение мысли"></button></label></li>
        <li><label class="r1-switch-row"><span class="r1-topic"><b>Тон и отношение автора</b><small>17</small></span><button type="button" class="r1-switch" role="switch" aria-checked="false" aria-label="Тон и отношение автора"></button></label></li>
        <li><label class="r1-switch-row"><span class="r1-topic"><b>Двойное отрицание</b><small><i lang="en">not un-, hardly</i> · 12</small></span><button type="button" class="r1-switch" role="switch" aria-checked="true" aria-label="Двойное отрицание"></button></label></li>
        <li><label class="r1-switch-row"><span class="r1-topic"><b>Значение по контексту</b><small>22</small></span><button type="button" class="r1-switch" role="switch" aria-checked="true" aria-label="Значение по контексту"></button></label></li>
        <li><label class="r1-switch-row"><span class="r1-topic"><b>Сравнение и аналогия</b><small>14</small></span><button type="button" class="r1-switch" role="switch" aria-checked="false" aria-label="Сравнение и аналогия"></button></label></li>
        <li><label class="r1-switch-row"><span class="r1-topic"><b>Оценочная лексика</b><small>24</small></span><button type="button" class="r1-switch" role="switch" aria-checked="true" aria-label="Оценочная лексика"></button></label></li>
      </ul>
      <div class="r1-field r1-diff">
        <span class="r1-label" id="r1-diff-l">Сложность</span>
        <div class="seg r1-seg r1-seg-4" role="group" aria-labelledby="r1-diff-l">
          <button type="button" aria-pressed="true">Любая</button>
          <button type="button" aria-pressed="false">Лёгкая</button>
          <button type="button" aria-pressed="false">Средняя</button>
          <button type="button" aria-pressed="false">Трудная</button>
        </div>
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Готово · 6 тем из 8</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'R5', group: 'R', name: 'Text Completion — три пропуска', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r1Top('verbal', 'Verbal · Text Completion', 5)}
    <div class="q-layout r1-tc3">
      <section class="q-stem">
        <p class="q-instr">Выберите по одному варианту для каждого пропуска.</p>
        <p class="q-text">The historian’s account of the treaty was far from <span class="blank">(i)</span>: it rested on a handful of <span class="blank">(ii)</span> letters, and its conclusions, though confidently stated, were at best <span class="blank">(iii)</span>.</p>
      </section>
      <section class="q-answers r1-cols">
        <fieldset class="opt-group">
          <legend>Пропуск (i)</legend>
          ${r1Radio('definitive', true)}${r1Radio('partisan')}${r1Radio('tedious')}
        </fieldset>
        <fieldset class="opt-group">
          <legend>Пропуск (ii)</legend>
          ${r1Radio('apocryphal', true)}${r1Radio('voluminous')}${r1Radio('celebrated')}
        </fieldset>
        <fieldset class="opt-group">
          <legend>Пропуск (iii)</legend>
          ${r1Radio('speculative')}${r1Radio('incontrovertible')}${r1Radio('derivative')}
        </fieldset>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary r1-disabled" aria-disabled="true">Проверить</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'R6', group: 'R', name: 'Sentence Equivalence — верно', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r1Top('verbal', 'Verbal · Sentence Equivalence', 6)}
    <div class="q-layout">
      <section class="q-stem">
        <p class="q-instr">Выберите два слова: оба подходят по смыслу и дают предложения с одинаковым значением.</p>
        <p class="q-text">Far from being <span class="blank blank-right">obstinate</span>, the new manager proved willing to revise her plans whenever the data pointed to a better course.</p>
      </section>
      <section class="q-answers">
        <div class="verdict r1-verdict-right" role="status">
          <svg class="ic"><use href="#i-check"/></svg>
          <span><b>Верно.</b> Оба слова значат «упрямый», а <i lang="en">far from</i> требует противоположности готовности менять планы.</span>
        </div>
        <fieldset class="opt-group r1-grid2">
          <legend class="r1-sr">Варианты</legend>
          ${r1Check('obstinate', true, ' r1-right')}${r1Check('gregarious')}
          ${r1Check('intransigent', true, ' r1-right')}${r1Check('meticulous')}
          ${r1Check('capricious')}${r1Check('diffident')}
        </fieldset>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Дальше</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'R7', group: 'R', name: 'Reading Comprehension — вопрос к тексту', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r1Top('verbal', 'Verbal · Reading Comprehension', 7)}
    <div class="q-layout r1-rc">
      <article class="r1-passage scroll" lang="en" aria-label="Текст">
        <p>${R1_PASSAGE.join(' ')}</p>
      </article>
      <section class="q-answers">
        <p class="q-text r1-q">The passage suggests that the camera studies chiefly challenge which assumption?</p>
        <fieldset class="opt-group">
          <legend class="r1-sr">Варианты</legend>
          ${r1Radio('That marine snow consists mainly of plankton')}
          ${r1Radio('That the deep ocean floor changes only very slowly', true)}
          ${r1Radio('That deposit feeders are rare on the abyssal plain')}
          ${r1Radio('That coastal reefs are more dynamic than the deep sea')}
          ${r1Radio('That surface warming does not affect plankton blooms')}
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

NS.add({ id: 'R8', group: 'R', name: 'Reading Comprehension — выбрать предложение', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r1Top('verbal', 'Verbal · Reading Comprehension', 8)}
    <div class="q-layout r1-rc">
      <section class="r1-rc-q">
        <p class="q-instr">Нажмите на предложение в тексте.</p>
        <p class="q-text r1-q" lang="en">Select the sentence that limits how far the camera findings should be generalized.</p>
      </section>
      <article class="r1-passage r1-passage-select scroll" lang="en" aria-label="Текст: предложения нажимаются">
        <p>${R1_PASSAGE.map((t, i) => `<button type="button" class="r1-sent" aria-pressed="${i === 4}">${t}</button>`).join(' ')}</p>
      </article>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'R9', group: 'R', name: 'Quantitative Comparison — до проверки', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    ${r1Top('quant', 'Quant · Quantitative Comparison', 4)}
    <div class="q-layout">
      <section class="q-stem">
        <p class="q-instr">Сравните величины A и B.</p>
        <p class="r1-cond" lang="en"><i>x</i> &gt; 0 and <i>x</i><sup>2</sup> = 3<i>x</i></p>
        <div class="r1-qc" lang="en">
          <div class="r1-qty"><span class="r1-qty-l">Quantity A</span><span class="r1-qty-v"><i>x</i> + 4</span></div>
          <div class="r1-qty"><span class="r1-qty-l">Quantity B</span><span class="r1-qty-v">2<i>x</i></span></div>
        </div>
      </section>
      <section class="q-answers">
        <fieldset class="opt-group" lang="en">
          <legend class="r1-sr">Варианты</legend>
          ${r1Radio('Quantity A is greater.', true)}
          ${r1Radio('Quantity B is greater.')}
          ${r1Radio('The two quantities are equal.')}
          ${r1Radio('The relationship cannot be determined from the information given.')}
        </fieldset>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost r1-icon-btn" aria-label="Калькулятор"><svg class="ic"><use href="#i-r1-calc"/></svg></button>
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
</div>
` });
