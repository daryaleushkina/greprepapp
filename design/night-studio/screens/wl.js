// Режим «Учить слова» (просьба Даши 10.10.2026: «режим, где ты просто учишь слова — и написать, и сказать»).
// Цикл по исследованию лучших приложений: знакомство → узнавание (W3–W6) → сборка из букв → написание →
// диктант → сказать вслух. Правила Даши: «выучено» — только по верным ответам; расписания, этапов памяти и дат
// повтора нет; произношение — встроенное распознавание устройства («узналось ли слово»), ошибка не наказывается.
// Сессия — 10 слов, ~7 мин; значения сверены по Merriam-Webster и Cambridge, примеры — свои.

NS.icon('i-wl-mic', '<rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
NS.icon('i-wl-mic-off', '<path d="M15 10V6a3 3 0 00-5.6-1.5M9 9v2a3 3 0 004.8 2.4M5.5 11a6.5 6.5 0 0010.6 5M18.5 11a6.5 6.5 0 01-.5 2.5M12 17.5V21M8.5 21h7M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
NS.icon('i-wl-mute', '<path d="M11 5L6 9H3v6h3l5 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
NS.icon('i-wl-hint', '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0012 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');

(() => {
  const session = (n) => `
    <header class="session-top sec-words">
      <button type="button" class="icon-btn" aria-label="Закончить и сохранить"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>Учить слова</span>
        <span class="session-count">${n} из 10</span>
      </div>
      <div class="session-bar" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${n - 1}" aria-label="Пройдено ${n - 1} из 10"><span style="width:${((n - 1) / 10) * 100}%"></span></div>
    </header>`;
  // Озвучка: обычная и медленная — медленная нужна, чтобы расслышать ударение и безударные гласные.
  const listen = (word) => `<span class="wl-audio">
      <button type="button" class="icon-btn icon-btn-soft" aria-label="Послушать ${word}"><svg class="ic"><use href="#i-play"/></svg></button>
      <button type="button" class="wl-slow" aria-label="Послушать медленно">0,5×</button>
    </span>`;
  const sw = (id, label, note, on) => `
    <div class="wl-switch-row">
      <span class="wl-switch-text"><span id="${id}-l">${label}</span><small>${note}</small></span>
      <button type="button" class="wl-switch" role="switch" aria-checked="${on}" aria-labelledby="${id}-l"></button>
    </div>`;

  NS.add({ id: 'W9', group: 'W', name: 'Учить слова — старт', html: `
<div class="app no-nav" data-screen="wl-start">
  <div class="main">
    <header class="top">
      <button type="button" class="icon-btn" aria-label="Назад к словам"><svg class="ic"><use href="#i-back"/></svg></button>
    </header>
    <div class="wl-start">
      <div class="wl-start-head">
        <h1 class="h1">Учить слова</h1>
        <p class="lead">Новое слово — сначала знакомство, потом узнать, собрать, написать и сказать вслух.</p>
      </div>
      <div class="wl-count">
        <label class="wl-count-field" for="w9-count">
          <input id="w9-count" type="number" inputmode="numeric" min="1" max="40" value="10">
          <span>слов</span>
        </label>
        <p class="wl-count-meta">~7 мин · 5 новых и 5 знакомых</p>
      </div>
      <div class="wl-switches">
        ${sw('w9-sound', 'Без звука', 'Диктанта не будет, слова — только текстом', false)}
        ${sw('w9-mic', 'Без микрофона', 'Говорить вслух не попросим', false)}
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Начать</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W10', group: 'W', name: 'Знакомство с новым словом', html: `
<div class="app no-nav" data-screen="wl-meet">
  <div class="main">
    ${session(1)}
    <article class="word wl-meet sec-words">
      <span class="wl-new">Новое слово</span>
      <header class="word-head">
        <h1 class="headword" lang="en">mitigate</h1>
        <p class="word-meta"><span lang="en">verb</span><span class="ipa">/ˈmɪtɪɡeɪt/</span>${listen('mitigate')}</p>
      </header>
      <section class="sense">
        <p class="wl-tr">смягчать, ослаблять</p>
        <p class="sense-en" lang="en">to make something less severe, serious or painful</p>
        <blockquote class="example"><p lang="en">Planting trees along the river helped mitigate the flooding.</p><p class="example-ru">Деревья вдоль реки помогли ослабить наводнения.</p></blockquote>
      </section>
    </article>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Уже знаю</button>
      <button type="button" class="btn btn-primary">Дальше</button>
    </footer>
  </div>
</div>
` });

  const letters = (word, filled) => word.split('').map((ch, i) =>
    `<span class="wl-slot${i < filled ? ' wl-slot-on' : ''}${i === filled ? ' wl-slot-next' : ''}">${i < filled ? ch : ''}</span>`).join('');

  NS.add({ id: 'W11', group: 'W', name: 'Собрать слово из букв', html: `
<div class="app no-nav" data-screen="wl-build">
  <div class="main">
    ${session(2)}
    <div class="wl-ask">
      <div class="wl-prompt">
        <p class="w-task">Соберите слово</p>
        <p class="wl-prompt-tr">смягчать, ослаблять</p>
        <p class="wl-prompt-en" lang="en">to make something less severe, serious or painful</p>
      </div>
      <div class="wl-slots" lang="en" aria-label="Собрано: miti, осталось 4 буквы">${letters('mitigate', 4)}</div>
      <div class="wl-tiles" role="group" aria-label="Буквы">
        ${['t', 'g', 'e', 'a'].map((ch) => `<button type="button" class="wl-tile" lang="en">${ch}</button>`).join('')}
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary" disabled>Проверить</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W12', group: 'W', name: 'Написать слово по значению', html: `
<div class="app no-nav" data-screen="wl-write">
  <div class="main">
    ${session(4)}
    <div class="wl-ask">
      <div class="wl-prompt">
        <p class="w-task">Напишите слово по-английски</p>
        <p class="wl-prompt-tr">вездесущий, встречающийся повсюду</p>
        <p class="wl-prompt-en" lang="en">seeming to be everywhere at the same time
          <button type="button" class="icon-btn icon-btn-soft wl-inline-play" aria-label="Послушать определение"><svg class="ic-sm"><use href="#i-play"/></svg></button></p>
      </div>
      <div class="wl-input-wrap">
        <label class="wl-input wl-input-active" for="w12-word">
          <span class="sr-only">Слово</span>
          <input id="w12-word" type="text" value="ubiq" lang="en" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
          <span class="wl-kbd" aria-hidden="true">EN</span>
        </label>
        <button type="button" class="wl-hint-btn"><svg class="ic-sm"><use href="#i-wl-hint"/></svg>Подсказать букву</button>
        <p class="wl-hint-note">С подсказкой слово вернётся ещё раз в этой сессии.</p>
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
</div>
` });

  // Сравнение по буквам: верные — обычные, лишняя — зачёркнута, пропущенная — вставлена акцентом.
  const diff = [['u'], ['b'], ['i'], ['q'], ['u'], ['i'], ['t'], ['t', 'extra'], ['o', 'miss'], ['u'], ['s']];
  NS.add({ id: 'W13', group: 'W', name: 'Почти верно — сравнение по буквам', html: `
<div class="app no-nav" data-screen="wl-almost">
  <div class="main">
    ${session(4)}
    <div class="wl-ask">
      <div class="verdict wl-almost" role="status">
        <svg class="ic"><use href="#i-wl-hint"/></svg>
        <span><b>Почти.</b> Одна буква лишняя, одной не хватает.</span>
      </div>
      <div class="wl-diff-block">
        <p class="wl-diff-label">Вы написали <span class="wl-yours" lang="en">ubiquittus</span></p>
        <p class="wl-diff" lang="en" aria-label="Верно: ubiquitous. Лишняя буква t, пропущена буква o">
          ${diff.map(([ch, kind]) => `<span class="wl-ch${kind ? ` wl-ch-${kind}` : ''}">${ch}</span>`).join('')}
        </p>
        <p class="wl-diff-legend"><span class="wl-key wl-key-extra">t</span> лишняя <span class="wl-key wl-key-miss">o</span> пропущена</p>
      </div>
      <div class="wl-input-wrap">
        <label class="wl-input wl-input-active" for="w13-word">
          <span class="wl-input-label">Перепишите слово</span>
          <input id="w13-word" type="text" value="" lang="en" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
          <span class="wl-kbd" aria-hidden="true">EN</span>
        </label>
        <p class="wl-hint-note">Слово вернётся в этой сессии — в копилку оно попадёт с первого верного раза.</p>
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide" disabled>Проверить</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W14', group: 'W', name: 'Диктант — написать на слух', html: `
<div class="app no-nav" data-screen="wl-dictation">
  <div class="main">
    ${session(6)}
    <div class="wl-ask">
      <div class="wl-prompt">
        <p class="w-task">Напишите, что услышали</p>
      </div>
      <div class="wl-big-audio">
        <button type="button" class="wl-big-play" aria-label="Послушать слово ещё раз"><svg class="ic"><use href="#i-play"/></svg></button>
        <button type="button" class="wl-slow" aria-label="Послушать медленно">0,5×</button>
      </div>
      <div class="wl-input-wrap">
        <label class="wl-input wl-input-active" for="w14-word">
          <span class="sr-only">Слово</span>
          <input id="w14-word" type="text" value="" placeholder="Слово по-английски" lang="en" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
          <span class="wl-kbd" aria-hidden="true">EN</span>
        </label>
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary" disabled>Проверить</button>
    </footer>
  </div>
</div>
` });

  const sayHead = `
      <div class="wl-prompt wl-say-prompt">
        <p class="w-task">Скажите вслух</p>
        <p class="w-prompt-word" lang="en">equivocal</p>
        <p class="word-meta"><span class="ipa">/ɪˈkwɪvəkəl/</span>${listen('equivocal')}</p>
      </div>`;

  NS.add({ id: 'W15', group: 'W', name: 'Сказать вслух — слово узнали', html: `
<div class="app no-nav" data-screen="wl-say">
  <div class="main">
    ${session(8)}
    <div class="wl-ask wl-say">
      ${sayHead}
      <div class="wl-mic-wrap">
        <button type="button" class="wl-mic wl-mic-done" aria-label="Сказать ещё раз"><svg class="ic"><use href="#i-wl-mic"/></svg></button>
      </div>
      <div class="verdict verdict-right" role="status">
        <svg class="ic"><use href="#i-check"/></svg>
        <span><b>Узнали:</b> <span lang="en">“equivocal”</span></span>
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Дальше</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W16', group: 'W', name: 'Сказать вслух — вторая попытка', html: `
<div class="app no-nav" data-screen="wl-say">
  <div class="main">
    ${session(8)}
    <div class="wl-ask wl-say">
      ${sayHead}
      <div class="wl-heard" role="status">
        <p>Услышано: <span lang="en">“equivocally”</span></p>
        <small>Телефон иногда слышит не то, что сказано, — это не ошибка.</small>
      </div>
      <div class="wl-mic-wrap">
        <button type="button" class="wl-mic" aria-label="Сказать ещё раз"><svg class="ic"><use href="#i-wl-mic"/></svg></button>
        <span class="wl-mic-label">Ещё раз</span>
      </div>
      <button type="button" class="wl-quiet"><svg class="ic-sm"><use href="#i-wl-mic-off"/></svg>Не могу говорить сейчас</button>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost wl-sample"><svg class="ic-sm"><use href="#i-play"/></svg>Образец</button>
      <button type="button" class="btn btn-ghost">Пропустить</button>
    </footer>
  </div>
</div>
` });

  const saved = [
    ['mitigate', 'смягчать, ослаблять'],
    ['laconic', 'лаконичный, немногословный'],
    ['ephemeral', 'недолговечный, мимолётный'],
    ['garrulous', 'болтливый'],
    ['prodigal', 'расточительный'],
  ];
  const later = [
    ['ubiquitous', 'вездесущий'],
    ['equivocal', 'двусмысленный, уклончивый'],
    ['obdurate', 'упрямый, непреклонный'],
  ];
  const row = ([w, t]) => `<li><div class="w-row w-row-static"><span class="w-row-word" lang="en">${w}</span><span class="w-row-tr">${t}</span></div></li>`;

  NS.add({ id: 'W17', group: 'W', name: 'Учить слова — итог', html: `
<div class="app no-nav" data-screen="wl-done">
  <div class="main">
    <header class="top">
      <button type="button" class="icon-btn" aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
    </header>
    <div class="wl-done scroll">
      <div class="wl-done-head">
        <p class="wl-done-num"><span class="w-num">+5</span> слов в копилке</p>
        <p class="w-done-sub">За 7 минут, каждое — с первого верного ответа</p>
      </div>
      <section class="wl-done-list" aria-labelledby="w17-saved">
        <h2 class="sr-only" id="w17-saved">Слова в копилке</h2>
        <ul class="w-list" role="list">${saved.map(row).join('')}</ul>
      </section>
      <section class="wl-done-list" aria-labelledby="w17-later">
        <h2 class="h3" id="w17-later">Ещё 3 слова вернутся, если продолжить</h2>
        <ul class="w-list" role="list">${later.map(row).join('')}</ul>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Ещё 5 минут</button>
      <button type="button" class="btn btn-primary">Готово</button>
    </footer>
  </div>
</div>
` });

  // ---------- Перевод: в обе стороны и фразой (просьба Даши 10.10.2026: «и написать, и перевести, и сказать») ----------
  NS.icon('i-wl-build', '<rect x="3" y="7" width="7" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="7" width="7" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>');
  NS.icon('i-wl-pen', '<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2"/>');
  NS.icon('i-wl-translate', '<path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 5.5 5 7M11 5c-.8 3.5-3.3 6.5-7 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.5 21l4-9 4 9M14 18h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
  NS.icon('i-wl-eye', '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>');

  NS.add({ id: 'W18', group: 'W', name: 'Перевести на русский — проверено', html: `
<div class="app no-nav" data-screen="wl-tr-ru">
  <div class="main">
    ${session(5)}
    <div class="wl-ask">
      <div class="wl-prompt">
        <p class="w-task">Переведите на русский</p>
        <p class="wl-prompt-word" lang="en">equivocal ${listen('equivocal')}</p>
      </div>
      <div class="wl-input-wrap">
        <label class="wl-input wl-input-right" for="w18-word">
          <span class="sr-only">Перевод</span>
          <input id="w18-word" type="text" value="двусмысленный" lang="ru" autocomplete="off" spellcheck="false" readonly>
          <span class="wl-kbd" aria-hidden="true">RU</span>
        </label>
      </div>
      <div class="verdict verdict-right" role="status">
        <svg class="ic"><use href="#i-check"/></svg>
        <span><b>Верно.</b> Принимаем: двусмысленный, уклончивый, неоднозначный.</span>
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Дальше</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W19', group: 'W', name: 'Перевести на английский — верно', html: `
<div class="app no-nav" data-screen="wl-tr-en">
  <div class="main">
    ${session(7)}
    <div class="wl-ask">
      <div class="wl-prompt">
        <p class="w-task">Напишите по-английски</p>
        <p class="wl-prompt-tr">лаконичный, немногословный</p>
      </div>
      <div class="wl-input-wrap">
        <label class="wl-input wl-input-right" for="w19-word">
          <span class="sr-only">Слово</span>
          <input id="w19-word" type="text" value="laconic" lang="en" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" readonly>
          <span class="wl-kbd" aria-hidden="true">EN</span>
        </label>
      </div>
      <div class="verdict verdict-right wl-verdict-play" role="status">
        <svg class="ic"><use href="#i-check"/></svg>
        <span><b>Верно.</b> <span lang="en">laconic</span> <span class="ipa">/ləˈkɒnɪk/</span></span>
        <button type="button" class="icon-btn icon-btn-soft" aria-label="Послушать laconic"><svg class="ic"><use href="#i-play"/></svg></button>
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Дальше</button>
    </footer>
  </div>
</div>
` });

  // Фраза: собрать перевод из плашек; две лишние — чтобы не угадывать по количеству.
  const placed = ['Его', 'лаконичный', 'ответ'];
  const left = [['закончил', false], ['многословный', false], ['разговор', false], ['начал', false]];
  NS.add({ id: 'W20', group: 'W', name: 'Перевести фразу — собрать из слов', html: `
<div class="app no-nav" data-screen="wl-tr-phrase">
  <div class="main">
    ${session(9)}
    <div class="wl-ask">
      <div class="wl-prompt">
        <p class="w-task">Переведите фразу</p>
        <p class="wl-phrase" lang="en"><span>His <b>laconic</b> reply ended the discussion.</span>${listen('фразу')}</p>
      </div>
      <div class="wl-answer" aria-label="Ваш перевод: Его лаконичный ответ…">
        ${placed.map((w) => `<button type="button" class="wl-chip wl-chip-on">${w}</button>`).join('')}
        <span class="wl-answer-gap" aria-hidden="true"></span>
      </div>
      <div class="wl-tiles" role="group" aria-label="Слова">
        ${left.map(([w]) => `<button type="button" class="wl-chip">${w}</button>`).join('')}
      </div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary" disabled>Проверить</button>
    </footer>
  </div>
</div>
` });

  // Карта одного занятия: открывается со старта (W9) по «Как проходит занятие». Без этапов памяти и дат.
  const steps = [
    ['i-play', 'Услышать', 'Слово, значение и пример — с озвучкой, можно медленно'],
    ['i-wl-eye', 'Узнать', 'Выбрать перевод, определение или синоним из четырёх'],
    ['i-wl-build', 'Собрать', 'Сложить слово из букв — только для новых слов'],
    ['i-wl-pen', 'Написать', 'По значению или на слух, ошибка показана по буквам'],
    ['i-wl-translate', 'Перевести', 'Слово в обе стороны и короткую фразу'],
    ['i-wl-mic', 'Сказать', 'Вслух в микрофон — телефон проверит, узнаётся ли слово'],
  ];
  NS.add({ id: 'W21', group: 'W', name: 'Как проходит занятие — все шаги', html: `
<div class="app no-nav" data-screen="wl-map">
  <div class="main">
    <header class="top">
      <button type="button" class="icon-btn" aria-label="Назад"><svg class="ic"><use href="#i-back"/></svg></button>
    </header>
    <div class="wl-map scroll">
      <div class="wl-map-head">
        <h1 class="h1">Как проходит занятие</h1>
        <p class="lead">Каждое новое слово проходит шесть шагов. Ошиблись — слово вернётся в этом же занятии.</p>
      </div>
      <ol class="wl-steps">
        ${steps.map(([ic, t, d]) => `<li class="wl-step"><span class="wl-step-ic"><svg class="ic"><use href="#${ic}"/></svg></span><span class="wl-step-text"><b>${t}</b><small>${d}</small></span></li>`).join('')}
      </ol>
      <p class="wl-map-note">Знакомые слова начинают сразу со второго шага. Без звука или без микрофона шаги «услышать» и «сказать» пропускаются.</p>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Начать · 10 слов</button>
    </footer>
  </div>
</div>
` });
})();
