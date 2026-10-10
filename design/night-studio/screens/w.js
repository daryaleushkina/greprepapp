// Группа W — слова. Экраны регистрируются через NS.add; стили — screens/w.css на токенах core.css.
// Правила Даши: этапов памяти, расписания и «выучено» в интерфейсе нет; «выучено» засчитывается только по верным
// ответам; количество — не кнопками 5/10/20. Сессия на сегодня — 12 слов, ~5 мин; цифры согласованы между экранами.
// Значения слов сверены по двум словарям (Merriam-Webster и Cambridge), примеры — свои.

NS.icon('i-w-search', '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
NS.icon('i-w-clear', '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');

(() => {
  // Шапка сессии слов: закрыть, «Слова на сегодня», счётчик и полоса.
  const session = (n) => `
    <header class="session-top sec-words">
      <button type="button" class="icon-btn" aria-label="Закрыть слова"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>Слова на сегодня</span>
        <span class="session-count">${n} из 12</span>
      </div>
      <div class="session-bar" role="progressbar" aria-valuemin="0" aria-valuemax="12" aria-valuenow="${n - 1}" aria-label="Пройдено ${n - 1} из 12"><span style="width:${((n - 1) / 12) * 100}%"></span></div>
    </header>`;
  const listen = (word) => `<button type="button" class="icon-btn icon-btn-soft" aria-label="Послушать ${word}"><svg class="ic"><use href="#i-play"/></svg></button>`;
  const opts = (label, items, checked) => `
    <fieldset class="opt-group w-opts" aria-label="${label}">
      ${items.map((t, i) => `<button type="button" class="opt" role="radio" aria-checked="${i === checked}"><span class="oval"></span><span>${t}</span></button>`).join('')}
    </fieldset>`;
  const recent = [
    ['laconic', 'лаконичный, немногословный'],
    ['ephemeral', 'недолговечный, мимолётный'],
    ['obdurate', 'упрямый, непреклонный'],
    ['prodigal', 'расточительный'],
    ['garrulous', 'болтливый'],
  ];

  NS.add({ id: 'W1', group: 'W', name: 'Вкладка «Слова»', html: `
<div class="app has-nav" data-screen="w-home">
  ${NS.nav('words')}
  <div class="main">
    ${NS.top()}
    <h1 class="h1">Слова</h1>
    <div class="w-home">
      <div class="w-home-main">
        <article class="w-today sec-words">
          <p class="w-today-count"><span class="w-num">12</span> слов на сегодня</p>
          <p class="w-today-meta">~5 мин</p>
          <button type="button" class="btn btn-primary">Начать</button>
        </article>
        <label class="w-search" for="w1-search">
          <svg class="ic"><use href="#i-w-search"/></svg>
          <span class="w-visually-hidden">Поиск по словам</span>
          <input id="w1-search" type="search" placeholder="Найти слово" autocomplete="off">
        </label>
      </div>
      <section class="w-recent" aria-labelledby="w1-recent">
        <h2 class="h3" id="w1-recent">Недавние</h2>
        <ul class="w-list" role="list">
          ${recent.map(([w, t]) => `<li><a href="#" class="w-row"><span class="w-row-word" lang="en">${w}</span><span class="w-row-tr">${t}</span><svg class="ic-sm w-chev"><use href="#i-chevron-right"/></svg></a></li>`).join('')}
        </ul>
      </section>
    </div>
  </div>
</div>
` });

  const found = [
    ['equivocal', 'adj.', 'двусмысленный, уклончивый'],
    ['equitable', 'adj.', 'справедливый, беспристрастный'],
    ['equanimity', 'noun', 'невозмутимость, самообладание'],
    ['equivocate', 'verb', 'говорить уклончиво, увиливать'],
    ['equilibrium', 'noun', 'равновесие'],
  ];
  NS.add({ id: 'W2', group: 'W', name: 'Поиск «equi…»', html: `
<div class="app has-nav" data-screen="w-search">
  ${NS.nav('words')}
  <div class="main">
    <header class="top top-back w-search-top">
      <button type="button" class="icon-btn" aria-label="Назад к словам"><svg class="ic"><use href="#i-back"/></svg></button>
      <label class="w-search w-search-active" for="w2-search">
        <svg class="ic"><use href="#i-w-search"/></svg>
        <span class="w-visually-hidden">Поиск по словам</span>
        <input id="w2-search" type="search" value="equi" autocomplete="off" lang="en">
        <button type="button" class="w-clear" aria-label="Очистить поиск"><svg class="ic-sm"><use href="#i-w-clear"/></svg></button>
      </label>
    </header>
    <p class="w-found">5 слов</p>
    <ul class="w-list w-results" role="list">
      ${found.map(([w, p, t]) => `<li><a href="#" class="w-row"><span class="w-row-head"><span class="w-row-word" lang="en"><mark>equi</mark>${w.slice(4)}</span><span class="w-pos" lang="en">${p}</span></span><span class="w-row-tr">${t}</span><svg class="ic-sm w-chev"><use href="#i-chevron-right"/></svg></a></li>`).join('')}
    </ul>
  </div>
</div>
` });

  NS.add({ id: 'W3', group: 'W', name: 'Выбрать перевод', html: `
<div class="app no-nav" data-screen="w-pick">
  <div class="main">
    ${session(3)}
    <div class="w-ask">
      <div class="w-prompt">
        <p class="w-task">Выберите перевод</p>
        <p class="w-prompt-word" lang="en">equivocal</p>
        <p class="word-meta"><span lang="en">adjective</span><span class="ipa">/ɪˈkwɪvəkəl/</span>${listen('equivocal')}</p>
      </div>
      ${opts('Перевод', ['справедливый, беспристрастный', 'двусмысленный, уклончивый', 'многословный, болтливый', 'невозмутимый, спокойный'], 1)}
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W4', group: 'W', name: 'Выбрать определение', html: `
<div class="app no-nav" data-screen="w-pick">
  <div class="main">
    ${session(5)}
    <div class="w-ask">
      <div class="w-prompt">
        <p class="w-task">Выберите определение</p>
        <p class="w-prompt-word" lang="en">ephemeral</p>
        <p class="word-meta"><span lang="en">adjective</span><span class="ipa">/ɪˈfem(ə)rəl/</span>${listen('ephemeral')}</p>
      </div>
      <div lang="en">${opts('Определение', ['stubbornly refusing to change one’s opinion', 'lasting for a very short time', 'spending money freely and wastefully', 'fond of talking, especially about trivial things'], -1)}</div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary" disabled>Проверить</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W5', group: 'W', name: 'Вставить в предложение', html: `
<div class="app no-nav" data-screen="w-pick">
  <div class="main">
    ${session(7)}
    <div class="w-ask">
      <div class="w-prompt">
        <p class="w-task">Какое слово подходит?</p>
        <p class="w-sentence" lang="en">The senator’s answer was so <span class="w-gap" aria-label="пропуск"></span> that reporters still could not tell whether she supported the bill.</p>
      </div>
      <div lang="en">${opts('Слово', ['equitable', 'equivocal', 'garrulous', 'ephemeral'], 1)}</div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary">Проверить</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W6', group: 'W', name: 'Подобрать синоним', html: `
<div class="app no-nav" data-screen="w-pick">
  <div class="main">
    ${session(9)}
    <div class="w-ask">
      <div class="w-prompt">
        <p class="w-task">Подберите синоним</p>
        <p class="w-prompt-word" lang="en">laconic</p>
        <p class="word-meta"><span lang="en">adjective</span><span class="ipa">/ləˈkɒnɪk/</span>${listen('laconic')}</p>
      </div>
      <div lang="en">${opts('Синоним', ['verbose', 'prodigal', 'terse', 'obdurate'], -1)}</div>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-ghost">Не знаю</button>
      <button type="button" class="btn btn-primary" disabled>Проверить</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W7', group: 'W', name: 'Верно — карточка слова', html: `
<div class="app no-nav" data-screen="w-card">
  <div class="main">
    ${session(3)}
    <div class="w-card scroll">
      <div class="verdict w-verdict-right" role="status">
        <svg class="ic"><use href="#i-check"/></svg>
        <span><b>Верно</b> — <span lang="en">equivocal</span> значит «двусмысленный».</span>
      </div>
      <article class="word sec-words">
        <header class="word-head">
          <h1 class="headword" lang="en">equivocal</h1>
          <p class="word-meta"><span lang="en">adjective</span><span class="ipa">/ɪˈkwɪvəkəl/</span>${listen('equivocal')}</p>
        </header>
        <section class="sense">
          <p class="sense-en" lang="en">open to more than one interpretation; deliberately vague to avoid committing oneself</p>
          <p class="sense-ru">двусмысленный, уклончивый</p>
          <blockquote class="example"><p lang="en">Asked about the merger, the CEO gave an equivocal answer that pleased no one.</p><p class="example-ru">На вопрос о слиянии директор ответил уклончиво — и не угодил никому.</p></blockquote>
        </section>
        <section class="sense w-sense-2">
          <p class="sense-en" lang="en">of uncertain nature or outcome</p>
          <p class="sense-ru">неясный, сомнительный</p>
          <blockquote class="example"><p lang="en">The trial produced equivocal results, so the drug needs further testing.</p><p class="example-ru">Испытание дало неоднозначные результаты — лекарство нужно проверять дальше.</p></blockquote>
        </section>
        <section class="relations">
          <div class="rel"><span class="rel-label">Синонимы</span><span class="chips" lang="en"><span class="chip">ambiguous</span><span class="chip">evasive</span><span class="chip">noncommittal</span></span></div>
          <div class="rel"><span class="rel-label">Антонимы</span><span class="chips" lang="en"><span class="chip">unequivocal</span><span class="chip">explicit</span></span></div>
        </section>
      </article>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Следующее слово · 4 из 12</button>
    </footer>
  </div>
</div>
` });

  NS.add({ id: 'W8', group: 'W', name: 'Итог слов', html: `
<div class="app no-nav" data-screen="w-done">
  <div class="main">
    <header class="top">
      <button type="button" class="icon-btn" aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
    </header>
    <div class="w-done">
      <div class="w-done-head">
        <p class="w-done-num"><span class="w-num">12</span> из 12</p>
        <p class="w-done-sub">10 сразу верно · 6 мин</p>
      </div>
      <section class="w-again" aria-labelledby="w8-again">
        <h2 class="h3" id="w8-again">Вернутся сегодня ещё раз</h2>
        <ul class="w-list" role="list">
          <li><div class="w-row w-row-static"><span class="w-row-word" lang="en">equivocal</span><span class="w-row-tr">двусмысленный, уклончивый</span>${listen('equivocal')}</div></li>
          <li><div class="w-row w-row-static"><span class="w-row-word" lang="en">obdurate</span><span class="w-row-tr">упрямый, непреклонный</span>${listen('obdurate')}</div></li>
        </ul>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Готово</button>
    </footer>
  </div>
</div>
` });
})();
