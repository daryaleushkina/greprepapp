// Группа L — TOEFL: экраны, которых у GRE нет (решение Даши 09.10.2026: весь TOEFL к запуску). Формат — TOEFL iBT
// после обновления 21.01.2026: Reading, Listening, Writing, Speaking, шкала 1–6 с шагом 0,5. Задания и фразы свои.

NS.icon('i-l-mic', '<rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
NS.icon('i-l-pause', '<path d="M8.5 5.5v13M15.5 5.5v13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>');
NS.icon('i-l-playfill', '<path d="M8 5.5v13l10.5-6.5L8 5.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>');
NS.icon('i-l-stop', '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="currentColor" stroke-width="1.5"/>');
NS.icon('i-l-headphones', '<path d="M4 15v-3a8 8 0 0116 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="3.5" y="14" width="4.5" height="6.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="2"/><rect x="16" y="14" width="4.5" height="6.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="2"/>');
// Повтор — без иконки: подпись и так ясна.
//NS.icon('i-l-retry', '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');

// Сессия: крестик, раздел и тип, счётчик (или время), полоса прогресса.
const lSession = (sec, label, count, done, total, timer = false) => `
    <header class="session-top sec-${sec}">
      <button type="button" class="icon-btn" aria-label="Закрыть тренировку"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>${label}</span>
        <span class="session-count${timer ? ' l-timer' : ''}">${count}</span>
      </div>
      <div class="session-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="Пройдено ${done} из ${total}"><span style="width:${Math.round(done / total * 100)}%"></span></div>
    </header>`;

// Вариант ответа: овал без буквы, как на экзамене.
const lOpt = (text, checked = false) =>
  `<button type="button" class="opt" role="radio" aria-checked="${checked}"><span class="oval"></span>${text}</button>`;

// Слово Complete the Words: видимая первая половина и клетки на недостающие буквы.
const lWord = (shown, missing, typed = '', current = false) => {
  const cells = [...missing].map((_, i) => {
    const v = typed[i] || '';
    const cur = current && i === typed.length ? ' l-cell-current' : '';
    return `<input class="l-cell${cur}" maxlength="1" value="${v}" aria-label="Буква ${i + 1} из ${missing.length}">`;
  }).join('');
  return `<span class="l-word">${shown}<span class="l-cells">${cells}</span></span>`;
};

NS.add({ id: 'L1', group: 'L', name: 'Тренировка — TOEFL', html: `
<div class="app has-nav l-home" data-screen="l-home">
  ${NS.nav('train', 'TOEFL')}
  <div class="main">
    ${NS.top('TOEFL')}
    <div class="home-grid">
      <section class="home-primary">
        <h1 class="h1">Тренировка</h1>
        <article class="start-card sec-listening">
          <h2 class="start-title">Listen to a Conversation</h2>
          <p class="start-meta"><span class="sec-dot"></span><span>Как в прошлый раз · Listening · 8 вопросов · ~10 мин</span></p>
          <div class="start-actions">
            <button type="button" class="btn btn-primary">Начать</button>
            <button type="button" class="btn btn-ghost"><svg class="ic-sm"><use href="#i-sliders"/></svg>Настроить</button>
          </div>
        </article>
        <h2 class="h2">Выбрать раздел</h2>
        <ul class="sections" role="list">
          <li class="section-row sec-reading">
            <a href="#" class="section-link">
              <span class="section-mark"></span>
              <span class="section-body"><span class="section-name">Reading</span><span class="section-types">Complete the Words · Read in Daily Life · Academic Passage</span></span>
              <span class="section-stat"><b>71 %</b><small>верно</small></span>
              <svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg>
            </a>
          </li>
          <li class="section-row sec-listening">
            <a href="#" class="section-link">
              <span class="section-mark"></span>
              <span class="section-body"><span class="section-name">Listening</span><span class="section-types">Choose a Response · Conversation · Announcement · Academic Talk</span></span>
              <span class="section-stat"><b>64 %</b><small>верно</small></span>
              <svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg>
            </a>
          </li>
          <li class="section-row sec-writing">
            <a href="#" class="section-link">
              <span class="section-mark"></span>
              <span class="section-body"><span class="section-name">Writing</span><span class="section-types">Build a Sentence · Write an Email · Academic Discussion</span></span>
              <span class="section-stat"><b>4,5</b><small>из 6</small></span>
              <svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg>
            </a>
          </li>
          <li class="section-row sec-speaking">
            <a href="#" class="section-link">
              <span class="section-mark"></span>
              <span class="section-body"><span class="section-name">Speaking</span><span class="section-types">Listen and Repeat · Take an Interview</span></span>
              <span class="section-stat"><b>4</b><small>из 6</small></span>
              <svg class="ic-sm section-chev"><use href="#i-chevron-right"/></svg>
            </a>
          </li>
        </ul>
      </section>
      <aside class="home-side">
        <a href="#" class="side-card">
          <svg class="ic"><use href="#i-repeat"/></svg>
          <span><b>Повторить мои ошибки</b><small>9 заданий из прошлых тренировок</small></span>
          <svg class="ic-sm"><use href="#i-chevron-right"/></svg>
        </a>
        <a href="#" class="side-card">
          <svg class="ic"><use href="#i-book"/></svg>
          <span><b>Слабое место: Academic Talk</b><small>Listening · 55 % верно</small></span>
          <svg class="ic-sm"><use href="#i-chevron-right"/></svg>
        </a>
        <div class="side-week">
          <p class="week-line"><b>Эта неделя: 3 дня</b> · 1 ч 25 мин · 4 оценки Speaking</p>
        </div>
      </aside>
    </div>
  </div>
</div>
` });

NS.add({ id: 'L2', group: 'L', name: 'Reading · Complete the Words', html: `
<div class="app no-nav" data-screen="l-words">
  <div class="main">
    ${lSession('reading', 'Reading · Complete the Words', '1 из 3', 0, 3)}
    <div class="l-ctw">
      <p class="q-instr">Допишите буквы, которых не хватает в словах.</p>
      <p class="l-ctw-text" lang="en">Honeybees share the location of food through a movement known as the waggle dance.
        The angle of the ${lWord('da', 'nce', 'nce')} ${lWord('sh', 'ows', 'ows')} the ${lWord('dire', 'ction', 'ction')} of the ${lWord('flo', 'wers', 'wer', true)} ${lWord('rela', 'tive')} to the sun,
        ${lWord('wh', 'ile')} the ${lWord('len', 'gth')} of the dance ${lWord('sig', 'nals')} ${lWord('dist', 'ance')}.
        Other bees watch closely and then fly straight to the source.</p>
      <p class="l-ctw-progress"><b>3</b> из 9 слов</p>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'L3', group: 'L', name: 'Listening · Listen and Choose a Response', html: `
<div class="app no-nav" data-screen="l-response">
  <div class="main">
    ${lSession('listening', 'Listening · Choose a Response', '3 из 8', 2, 8)}
    <div class="q-layout">
      <section class="q-stem">
        <div class="l-player sec-listening">
          <button type="button" class="l-play" aria-label="Пауза"><svg class="ic"><use href="#i-l-pause"/></svg></button>
          <div class="l-track">
            <div class="l-wave" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<span class="${i < 17 ? 'on' : ''}" style="height:${[30, 55, 40, 70, 45, 85, 60, 35, 75, 50, 90, 40, 65, 30, 55, 80, 45, 60, 35, 70, 50, 40, 65, 30, 55, 45, 35, 25][i]}%"></span>`).join('')}</div>
            <p class="l-time"><span>0:04</span><span>0:07</span></p>
          </div>
        </div>
        <p class="l-once"><svg class="ic-sm"><use href="#i-l-headphones"/></svg>Прослушать можно один раз, как на экзамене</p>
      </section>
      <section class="q-answers">
        <fieldset class="opt-group">
          <legend>Выберите лучший ответ на реплику</legend>
          ${lOpt('Until ten, I think — they extended the hours for exams.', true)}
          ${lOpt('I returned that book on Monday.')}
          ${lOpt('Yes, I know exactly where it is.')}
          ${lOpt('It’s a long walk from the dorms.')}
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

NS.add({ id: 'L4', group: 'L', name: 'Listening · Academic Talk — вопрос', html: `
<div class="app no-nav" data-screen="l-talk">
  <div class="main">
    ${lSession('listening', 'Listening · Academic Talk', '5 из 8', 4, 8)}
    <div class="q-layout">
      <section class="q-stem">
        <p class="l-heard sec-listening"><svg class="ic-sm"><use href="#i-check"/></svg><span>Лекция прослушана · 2:41</span></p>
        <p class="l-talk-title" lang="en">Biology lecture: how desert plants survive dry years</p>
        <p class="q-text" lang="en">What is the professor’s main point about the seeds of desert annuals?</p>
      </section>
      <section class="q-answers">
        <fieldset class="opt-group">
          <legend>Выберите один ответ</legend>
          ${lOpt('They can stay dormant for years until enough rain falls.', true)}
          ${lOpt('They sprout after any rain, however light.')}
          ${lOpt('They need animals to carry them to wetter areas.')}
          ${lOpt('They grow only in the shade of larger plants.')}
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

NS.add({ id: 'L5', group: 'L', name: 'Writing · Build a Sentence', html: `
<div class="app no-nav" data-screen="l-build">
  <div class="main">
    ${lSession('writing', 'Writing · Build a Sentence', '4 из 10', 3, 10)}
    <div class="q-layout">
      <section class="q-stem">
        <p class="q-instr">Соберите ответ из слов.</p>
        <div class="l-bubble" lang="en"><span class="l-who">Lab partner</span>Did you finish the lab report?</div>
        <p class="l-frame" lang="en" aria-label="Ответ: Not yet. I still need to … the final graph.">
          Not yet. I still
          <span class="l-slot l-slot-filled">need</span>
          <span class="l-slot l-slot-filled">to</span>
          <span class="l-slot l-slot-empty" aria-label="Пустое место"></span>
          the final graph.
        </p>
      </section>
      <section class="q-answers">
        <p class="l-tiles-label">Слова</p>
        <div class="l-tiles" lang="en">
          <button type="button" class="l-tile l-tile-used" aria-label="need — уже в ответе" disabled>need</button>
          <button type="button" class="l-tile l-tile-used" aria-label="to — уже в ответе" disabled>to</button>
          <button type="button" class="l-tile">add</button>
          <button type="button" class="l-tile">adding</button>
          <button type="button" class="l-tile">for</button>
        </div>
        <p class="l-hint">Нажмите слово, чтобы поставить его на свободное место; нажмите слово в ответе, чтобы убрать.</p>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'L6', group: 'L', name: 'Writing · Write an Email', html: `
<div class="app no-nav" data-screen="l-email">
  <div class="main">
    ${lSession('writing', 'Writing · Write an Email', '4:36', 2, 7, true)}
    <div class="r-layout l-email">
      <section class="l-task scroll" lang="en">
        <p>You joined a campus photography club last month, but the weekly meeting has moved to Thursday evening, when you work at the campus bookstore.</p>
        <p>Write an email to Maya Chen, the club organizer. In your email:</p>
        <ul class="l-points">
          <li>explain the problem;</li>
          <li>ask how else you can take part;</li>
          <li>suggest a solution.</li>
        </ul>
      </section>
      <section class="l-compose">
        <p class="l-to" lang="en"><span>To:</span> Maya Chen</p>
        <label class="l-field-label" for="l6-email">Ваше письмо</label>
        <textarea id="l6-email" class="l-textarea" lang="en" spellcheck="false">Hi Maya,

I joined the photography club in September and really enjoyed the first two meetings. Unfortunately, the new Thursday time overlaps with my shift at the campus bookstore, so I</textarea>
        <p class="l-count"><b>47</b> слов · обычно 80–120</p>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary">Готово</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'L7', group: 'L', name: 'Speaking · Listen and Repeat — перед записью', html: `
<div class="app no-nav" data-screen="l-repeat">
  <div class="main">
    ${lSession('speaking', 'Speaking · Listen and Repeat', '2 из 7', 1, 7)}
    <div class="l-speak">
      <p class="l-context">Экскурсия по кампусу. Повторите фразу гида так же, как услышали.</p>
      <p class="l-heard sec-speaking"><svg class="ic-sm"><use href="#i-check"/></svg><span>Фраза прослушана · один раз</span></p>
      <div class="l-rec-zone">
        <button type="button" class="l-rec" aria-label="Начать запись"><svg class="ic"><use href="#i-l-mic"/></svg></button>
        <p class="l-rec-title">Говорите после сигнала</p>
        <p class="l-rec-sub">На ответ — <b>10</b> секунд. Запись начнётся сама после сигнала или по нажатию.</p>
      </div>
    </div>
  </div>
</div>
` });

NS.add({ id: 'L8', group: 'L', name: 'Speaking · Take an Interview — идёт запись', html: `
<div class="app no-nav" data-screen="l-interview">
  <div class="main">
    ${lSession('speaking', 'Speaking · Take an Interview', '2 из 4', 1, 4)}
    <div class="l-speak l-interview">
      <div class="l-bubble l-bubble-wide" lang="en"><span class="l-who">Interviewer</span>Some students prefer to study alone, while others like to study in groups. Which do you prefer, and why?</div>
      <div class="l-rec-zone">
        <p class="l-live" role="status"><span class="l-live-dot"></span>Идёт запись</p>
        <p class="l-countdown" aria-label="Осталось 31 секунда из 45"><span>0:31</span><small>из 0:45</small></p>
        <div class="l-meter" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<span style="height:${[20, 35, 60, 45, 80, 55, 30, 70, 90, 50, 40, 75, 60, 85, 45, 30, 65, 50, 35, 70, 40, 25, 45, 20][i]}%"></span>`).join('')}</div>
        <p class="l-rec-sub">Микрофон слышит вас. Говорите спокойно, паузы не страшны.</p>
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide"><svg class="ic-sm"><use href="#i-l-stop"/></svg>Остановить запись</button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'L9', group: 'L', name: 'Speaking · оценка ответа', html: `
<div class="app no-nav" data-screen="l-score">
  <div class="main">
    <header class="top top-back">
      <button type="button" class="icon-btn" aria-label="Назад"><svg class="ic"><use href="#i-back"/></svg></button>
      <span class="top-title">Speaking · Take an Interview</span>
    </header>
    <div class="r-layout l-result scroll">
      <section class="l-score sec-speaking">
        <p class="l-score-num"><span>4,5</span><small>из 6</small></p>
        <p class="l-score-note">Примерно · наша оценка, не официальная</p>
        <div class="l-said">
          <p class="l-said-label">Что вы сказали</p>
          <p lang="en">I prefer studying in groups, because other people often notice mistakes that I miss. For example, last semester my friends helped me understand <mark class="l-mark">statistics</mark> before the final exam, and I got a much better grade.</p>
        </div>
      </section>
      <section class="l-advice">
        <h2 class="h2">Что улучшить</h2>
        <ol class="l-tips">
          <li><b>Содержание.</b> Пример хороший, но нет вывода. Закончите одной фразой, почему группа помогает именно вам.</li>
          <li><b>Язык.</b> Связки однообразны: <i lang="en">because</i> и <i lang="en">and</i>. Попробуйте <i lang="en">since</i>, <i lang="en">as a result</i>.</li>
          <li><b>Произношение.</b> <i lang="en">statistics</i> — ударение на второй слог: sta-<b>TIS</b>-tics.</li>
        </ol>
        <p class="l-left">Осталось <b>18</b> из 20 оценок в этом месяце</p>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Дальше</button>
      <button type="button" class="btn btn-primary">Попробовать ещё раз</button>
    </footer>
  </div>
</div>
` });
