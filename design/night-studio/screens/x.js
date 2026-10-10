// Группа X — экзамен и эссе. Пробник — по-английски, как настоящий экзамен (PRODUCT.md, «Пробный экзамен»):
// на вопросе только секция, номер и время, без Hide Time; карта частей — только на старте и между секциями.
// Темы эссе и задания — свои.

NS.icon('i-x-flag', '<path d="M5 21V4M5 4h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
NS.icon('i-x-grid', '<rect x="4" y="4" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="4" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="14" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>');
NS.icon('i-x-calc', '<rect x="5" y="3" width="14" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
NS.icon('i-x-clock', '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
NS.icon('i-x-pen', '<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2"/>');
NS.icon('i-x-shuffle', '<path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.5M14 9.5c.8-1.4 1.8-2.5 2.6-2.5H20M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
NS.icon('i-x-mic', '<rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');

// Карта частей GRE. done — пройденные, next — следующая (X6).
const xGreMap = (done = 0) => {
  const parts = [
    ['sec-essay', 'Analytical Writing', '1 essay', '30 min'],
    ['sec-verbal', 'Verbal 1', '12 questions', '18 min'],
    ['sec-verbal', 'Verbal 2', '15 questions', '23 min'],
    ['sec-quant', 'Quant 1', '12 questions', '21 min'],
    ['sec-quant', 'Quant 2', '15 questions', '26 min'],
  ];
  return `<ol class="x-map" role="list">${parts.map(([sec, name, what, time], i) => {
    const state = i < done ? 'done' : i === done && done > 0 ? 'next' : 'todo';
    const mark = state === 'done' ? '<svg class="ic-sm"><use href="#i-check"/></svg>' : '';
    return `<li class="x-part ${sec}" data-state="${state}"><span class="x-node">${mark}</span><span class="x-part-body"><b>${name}</b><small>${what}</small></span><span class="x-part-time">${time}</span></li>`;
  }).join('')}</ol>`;
};

NS.add({ id: 'X1', group: 'X', name: 'Экзамен — вкладка', html: `
<div class="app has-nav" data-screen="x-home">
  ${NS.nav('exam')}
  <div class="main">
    ${NS.top()}
    <div class="x-home">
      <section class="x-home-main">
        <h1 class="h1">Экзамен</h1>
        <article class="x-mock-card">
          <h2 class="x-mock-title">Пробный экзамен 2</h2>
          <p class="x-mock-meta">Пять частей, как в настоящем GRE · <span class="x-num">1 ч 58 мин</span></p>
          <div class="x-mock-strip" aria-hidden="true">
            <span class="sec-essay"></span><span class="sec-verbal"></span><span class="sec-verbal"></span><span class="sec-quant"></span><span class="sec-quant"></span>
          </div>
          <div class="start-actions">
            <button type="button" class="btn btn-primary">Начать весь</button>
            <button type="button" class="btn btn-ghost">Одна секция</button>
          </div>
        </article>
        <a href="#" class="x-row sec-essay">
          <span class="x-row-ic"><svg class="ic"><use href="#i-x-pen"/></svg></span>
          <span class="x-row-body"><b>Эссе · <span lang="en">Analyze an Issue</span></b><small>30 минут, оценка примерная</small></span>
          <span class="x-row-stat"><b class="x-num">18 из 20</b><small>оценок осталось</small></span>
          <svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg>
        </a>
      </section>
      <aside class="x-home-side">
        <a href="#" class="x-row x-row-past">
          <span class="x-row-body"><b>Пробный экзамен 1</b><small>2 октября · 1 ч 58 мин</small></span>
          <span class="x-row-stat"><b class="x-num">V 154 · Q 160</b><small>наша оценка</small></span>
          <svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg>
        </a>
        <a href="#" class="x-quiet-link">Официальный пробник POWERPREP</a>
      </aside>
    </div>
  </div>
</div>
` });

NS.add({ id: 'X2', group: 'X', name: 'Старт пробника GRE', html: `
<div class="app no-nav" data-screen="x-start" lang="en">
  <div class="main">
    <header class="x-head">
      <button type="button" class="icon-btn" aria-label="Close"><svg class="ic"><use href="#i-close"/></svg></button>
      <span class="x-head-title">Practice Test 2</span>
    </header>
    <div class="x-start">
      <section class="x-start-map">
        <h1 class="h1">GRE General Test</h1>
        <p class="x-start-total"><span class="x-big">1 h 58 min</span><span>5 sections</span></p>
        ${xGreMap(0)}
      </section>
      <section class="x-start-setup">
        <div class="seg x-seg" role="group" aria-label="Test length">
          <button type="button" aria-pressed="true">Full test</button>
          <button type="button" aria-pressed="false">One section</button>
        </div>
        <ul class="x-rules" role="list">
          <li><svg class="ic-sm"><use href="#i-x-flag"/></svg><span>Mark questions and return to them before a section ends.</span></li>
          <li><svg class="ic-sm"><use href="#i-x-calc"/></svg><span>An on-screen calculator is available in Quant.</span></li>
          <li><svg class="ic-sm"><use href="#i-x-clock"/></svg><span>The timer stays on screen. When it runs out, the section closes.</span></li>
        </ul>
        <footer class="bottom-bar">
          <button type="button" class="btn btn-primary btn-wide">Start</button>
        </footer>
      </section>
    </div>
  </div>
</div>
` });

NS.add({ id: 'X3', group: 'X', name: 'Пробник — эссе', html: `
<div class="app no-nav" data-screen="x-essay-test" lang="en">
  <div class="main">
    <header class="x-bar sec-essay">
      <span class="x-bar-sec">Analytical Writing</span>
      <span class="x-time" aria-label="Time left 24 minutes 10 seconds">24:10</span>
    </header>
    <div class="x-write">
      <section class="x-prompt">
        <p class="x-claim">“A city reveals more about itself through its ordinary streets than through its famous monuments.”</p>
        <p class="x-instr">Explain how far you agree with the claim. Support your view with reasons and examples, and answer the strongest objection to it.</p>
      </section>
      <section class="x-editor">
        <div class="x-field" role="textbox" aria-multiline="true" aria-label="Your response" tabindex="0">
          <p>Monuments are built to be seen; streets are built to be used. That difference is why I largely agree with the claim. A monument tells us what a city wanted to say about itself at one moment, usually through the eyes of those who could afford to commission it. An ordinary street, by contrast, records thousands of small decisions made over decades<span class="x-caret"></span></p>
        </div>
        <p class="x-count"><span class="x-num">68</span> words</p>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary">Next</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'X4', group: 'X', name: 'Пробник — вопрос Quant', html: `
<div class="app no-nav" data-screen="x-question" lang="en">
  <div class="main">
    <header class="x-bar sec-quant">
      <span class="x-bar-sec">Quant 1 · <span class="x-num">7 / 12</span></span>
      <span class="x-time" aria-label="Time left 14 minutes 32 seconds">14:32</span>
    </header>
    <div class="x-tools" role="toolbar" aria-label="Test tools">
      <button type="button" class="x-tool" aria-pressed="false"><svg class="ic-sm"><use href="#i-x-flag"/></svg>Mark</button>
      <button type="button" class="x-tool"><svg class="ic-sm"><use href="#i-x-grid"/></svg>Review</button>
      <button type="button" class="x-tool"><svg class="ic-sm"><use href="#i-x-calc"/></svg>Calculator</button>
    </div>
    <div class="x-q">
      <section class="x-qc">
        <p class="x-qc-given"><i>x</i> &gt; 0</p>
        <div class="x-qc-cols">
          <div class="x-qc-col"><span class="x-qc-label">Quantity A</span><span class="x-qc-val">(<i>x</i> + 1)<sup>2</sup></span></div>
          <div class="x-qc-col"><span class="x-qc-label">Quantity B</span><span class="x-qc-val"><i>x</i><sup>2</sup> + 1</span></div>
        </div>
      </section>
      <section class="q-answers">
        <div class="opt-group" role="radiogroup" aria-label="Answer">
          <button type="button" class="opt" role="radio" aria-checked="true"><span class="oval"></span>Quantity A is greater.</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>Quantity B is greater.</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>The two quantities are equal.</button>
          <button type="button" class="opt" role="radio" aria-checked="false"><span class="oval"></span>The relationship cannot be determined from the information given.</button>
        </div>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Back</button>
      <button type="button" class="btn btn-primary">Next</button>
    </footer>
  </div>
</div>
` });

const xCells = [
  ['a'], ['a'], ['m'], ['a'], ['n'], ['a'], ['a', 'cur'], ['n'], ['a', 'm'], ['n'], ['n'], ['n'],
].map(([s, x2], i) => {
  const st = s === 'a' ? 'answered' : s === 'm' ? 'marked' : 'empty';
  const marked = s === 'm' || x2 === 'm';
  const label = `Question ${i + 1}: ${st === 'answered' ? 'answered' : st === 'marked' ? 'not answered' : 'not answered'}${marked ? ', marked' : ''}`;
  return `<button type="button" class="x-cell" data-state="${st === 'marked' ? 'empty' : st}"${x2 === 'cur' ? ' aria-current="true"' : ''} aria-label="${label}"><span class="x-num">${i + 1}</span>${marked ? '<svg class="x-cell-flag"><use href="#i-x-flag"/></svg>' : ''}</button>`;
}).join('');

NS.add({ id: 'X5', group: 'X', name: 'Пробник — Review', html: `
<div class="app no-nav" data-screen="x-review" lang="en">
  <div class="main">
    <header class="x-bar sec-quant">
      <span class="x-bar-sec">Quant 1 · Review</span>
      <span class="x-time" aria-label="Time left 13 minutes 58 seconds">13:58</span>
    </header>
    <div class="x-review">
      <section class="x-review-grid-wrap">
        <h1 class="h2">7 of 12 answered</h1>
        <div class="x-grid">${xCells}</div>
      </section>
      <section class="x-legend" aria-label="Legend">
        <span><i class="x-sw" data-state="answered"></i>Answered</span>
        <span><i class="x-sw" data-state="empty"></i>Not answered</span>
        <span><svg class="ic-sm x-legend-flag"><use href="#i-x-flag"/></svg>Marked</span>
        <p class="x-legend-note">Tap a question to go to it.</p>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Return to question 7</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'X6', group: 'X', name: 'Пробник — между секциями', html: `
<div class="app no-nav" data-screen="x-between" lang="en">
  <div class="main">
    <div class="x-between">
      <section class="x-between-head">
        <span class="x-done-badge sec-quant"><svg class="ic"><use href="#i-check"/></svg></span>
        <h1 class="h1">Quant 1 complete</h1>
        <p class="lead">Next: Quant 2 · 15 questions · <span class="x-num">26 min</span>. The timer starts when you press Start.</p>
      </section>
      ${xGreMap(4)}
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Start Quant 2</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'X7', group: 'X', name: 'Пробник — результат', html: `
<div class="app no-nav" data-screen="x-results">
  <div class="main">
    <header class="x-head">
      <button type="button" class="icon-btn" aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      <span class="x-head-title">2 октября · 1 ч 58 мин</span>
    </header>
    <div class="x-results scroll">
      <section class="x-results-score">
        <h1 class="h1">Пробный экзамен 1</h1>
        <div class="x-scores">
          <div class="x-score sec-verbal"><span class="score-label"><span class="sec-dot"></span>Verbal</span><span class="x-score-range">152–156</span><span class="x-score-likely">скорее всего <b class="x-num">154</b></span></div>
          <div class="x-score sec-quant"><span class="score-label"><span class="sec-dot"></span>Quant</span><span class="x-score-range">158–162</span><span class="x-score-likely">скорее всего <b class="x-num">160</b></span></div>
        </div>
        <p class="x-note">Наша оценка, не официальная. Официальный балл даёт только ETS.</p>
      </section>
      <section class="x-results-parts">
        <ul class="x-tally" role="list">
          <li class="sec-verbal"><span class="sec-dot"></span><span class="x-tally-name">Verbal</span><span class="x-tally-val"><b class="x-num">19</b> из 27 верно</span></li>
          <li class="sec-quant"><span class="sec-dot"></span><span class="x-tally-name">Quant</span><span class="x-tally-val"><b class="x-num">21</b> из 27 верно</span></li>
          <li class="sec-essay"><span class="sec-dot"></span><span class="x-tally-name">Эссе</span><span class="x-tally-val"><b class="x-num">4.0</b> — примерно, ±1</span></li>
        </ul>
        <a href="#" class="x-quiet-link">Официальный пробник POWERPREP</a>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Разобрать ошибки · <span class="x-num">14</span></button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'X8', group: 'X', name: 'Эссе — выбор темы', html: `
<div class="app has-nav" data-screen="x-topics">
  ${NS.nav('exam')}
  <div class="main">
    <header class="top top-back">
      <button type="button" class="icon-btn" aria-label="Назад к экзамену"><svg class="ic"><use href="#i-back"/></svg></button>
      <span class="top-title">Экзамен</span>
    </header>
    <div class="x-topics">
      <div class="x-topics-head">
        <h1 class="h1">Эссе</h1>
        <p class="lead"><span lang="en">Analyze an Issue</span> · 30 минут · осталось <span class="x-num">18</span> из 20 в этом месяце</p>
      </div>
      <ul class="x-topic-list" role="list" lang="en">
        <li><a href="#" class="x-topic sec-essay"><span>“Governments should spend more on keeping local languages alive than on teaching one global language.”</span><svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg></a></li>
        <li><a href="#" class="x-topic sec-essay"><span>“The most important discoveries usually come from people working outside the recognized experts of a field.”</span><svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg></a></li>
        <li><a href="#" class="x-topic sec-essay"><span>“A city that closes its center to cars becomes a better place to live for everyone.”</span><svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg></a></li>
      </ul>
      <button type="button" class="btn btn-ghost x-random"><svg class="ic-sm"><use href="#i-x-shuffle"/></svg>Случайная тема</button>
    </div>
  </div>
</div>
` });

NS.add({ id: 'X9', group: 'X', name: 'Эссе — письмо', html: `
<div class="app no-nav" data-screen="x-essay">
  <div class="main">
    <header class="x-head">
      <button type="button" class="icon-btn" aria-label="Закрыть эссе"><svg class="ic"><use href="#i-close"/></svg></button>
      <span class="x-head-title">Эссе</span>
      <span class="x-head-right"><span class="x-num">312</span> слов</span>
    </header>
    <div class="x-write">
      <section class="x-prompt x-prompt-compact">
        <p class="x-claim" lang="en">“A city that closes its center to cars becomes a better place to live for everyone.”</p>
        <label class="x-switch"><span>Таймер 30 минут</span><input type="checkbox" role="switch" id="x9-timer"><span class="x-switch-track" aria-hidden="true"></span></label>
      </section>
      <section class="x-editor">
        <div class="x-field scroll" role="textbox" aria-multiline="true" aria-label="Текст эссе" tabindex="0" lang="en">
          <p>Closing a city center to cars is usually presented as a simple gain: cleaner air, quieter streets, safer crossings. I agree that most residents benefit, but the claim that everyone does goes too far, and the exceptions matter for how such a policy should be designed.</p>
          <p>The strongest case for the claim is what happens to public space. A single traffic lane can move a few hundred cars an hour; the same strip, given to pedestrians, cafés and trees, becomes a place where people stay. Shops on car-free streets often report more customers, not fewer, because a walking visitor passes every window instead of only the one they parked near.</p>
          <p>Yet “everyone” includes people for whom the car is not a convenience but a necessity. An elderly resident with limited mobility, a nurse finishing a night shift when buses no longer run, a plumber carrying forty kilograms of tools: for them, a closed center can mean a longer, harder or more expensive day. A policy that ignores them is not making the city better for everyone; it is shifting costs onto the people least able to bear them.</p>
          <p>This does not defeat the claim so much as qualify it. The cities where car-free centers work best are the ones that pair the ban with exceptions and alternatives: delivery windows in the early morning, permits for residents with disabilities, frequent night buses. With those in place, the benefits reach nearly everyone, and the remaining costs are small and shared.</p>
          <p>In the end, closing a center to cars makes a city better for most of its residents, and it can make it better for almost all of them, but only if the policy is built around the people the car still serves.</p>
        </div>
      </section>
    </div>
    <footer class="bottom-bar x-bottom-note">
      <button type="button" class="btn btn-primary btn-wide">Отправить на оценку</button>
      <p class="x-note">Останется <span class="x-num">17</span> из 20 оценок в этом месяце</p>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'X10', group: 'X', name: 'Эссе — оценка', html: `
<div class="app no-nav" data-screen="x-essay-score">
  <div class="main">
    <header class="x-head">
      <button type="button" class="icon-btn" aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      <span class="x-head-title">Эссе · 312 слов</span>
    </header>
    <div class="x-score-page scroll">
      <section class="x-essay-grade sec-essay">
        <p class="x-grade"><span class="x-grade-num">4.0</span><span class="x-grade-of">из 6</span></p>
        <p class="x-note">Оценка примерная: её ставит модель, точность ±1.</p>
      </section>
      <section class="x-improve">
        <h1 class="h2">Что улучшить</h1>
        <ol class="x-tips" role="list">
          <li>
            <b>Примеры общие, а не конкретные.</b>
            <p>«Shops on car-free streets often report more customers» — какие улицы, какой город? Один названный пример сильнее трёх общих.</p>
          </li>
          <li>
            <b>Возражение есть, но ответ на него короткий.</b>
            <p>Абзац про пожилых и медиков сильный, а ответ — один абзац общих мер. Покажите, как такое уже сработало в одном городе.</p>
          </li>
          <li>
            <b>Вывод повторяет вступление.</b>
            <p>«…better for most of its residents…» — то же, что в начале. Закончите тем, что из этого следует для городов, которые только планируют запрет.</p>
          </li>
        </ol>
        <p class="x-note">Осталось <span class="x-num">17</span> из 20 оценок в этом месяце</p>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Готово</button>
      <button type="button" class="btn btn-primary">Переписать</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'X11', group: 'X', name: 'Старт пробника TOEFL', html: `
<div class="app no-nav" data-screen="x-start-toefl" lang="en">
  <div class="main">
    <header class="x-head">
      <button type="button" class="icon-btn" aria-label="Close"><svg class="ic"><use href="#i-close"/></svg></button>
      <span class="x-head-title">TOEFL · Practice Test 1</span>
    </header>
    <div class="x-start">
      <section class="x-start-map">
        <h1 class="h1">TOEFL iBT</h1>
        <p class="x-start-total"><span class="x-big">~1 h 30 min</span><span>4 sections · each scored 1–6</span></p>
        <ol class="x-map" role="list">
          <li class="x-part sec-reading" data-state="todo"><span class="x-node"></span><span class="x-part-body"><b>Reading</b><small>50 questions · adaptive</small></span><span class="x-part-time">~30 min</span></li>
          <li class="x-part sec-listening" data-state="todo"><span class="x-node"></span><span class="x-part-body"><b>Listening</b><small>47 questions · adaptive</small></span><span class="x-part-time">~29 min</span></li>
          <li class="x-part sec-writing" data-state="todo"><span class="x-node"></span><span class="x-part-body"><b>Writing</b><small>12 tasks</small></span><span class="x-part-time">23 min</span></li>
          <li class="x-part sec-speaking" data-state="todo"><span class="x-node"></span><span class="x-part-body"><b>Speaking</b><small>11 tasks · microphone</small></span><span class="x-part-time">8 min</span></li>
        </ol>
      </section>
      <section class="x-start-setup">
        <div class="seg x-seg" role="group" aria-label="Test length">
          <button type="button" aria-pressed="true">Full test</button>
          <button type="button" aria-pressed="false">One section</button>
        </div>
        <ul class="x-rules" role="list">
          <li><svg class="ic-sm"><use href="#i-x-mic"/></svg><span>Speaking records your voice. Use headphones and a quiet room.</span></li>
          <li><svg class="ic-sm"><use href="#i-x-clock"/></svg><span>Each section has its own timer. Your score is the average of the four, rounded to the nearest half.</span></li>
        </ul>
        <footer class="bottom-bar">
          <button type="button" class="btn btn-primary btn-wide">Start</button>
        </footer>
      </section>
    </div>
  </div>
</div>
` });
