// Переходы по вопросам (решение Даши 10.10.2026): в разборе — назад и вперёд по всем вопросам тренировки;
// в «Практике» — вернуться к прошлому вопросу и перечитать разбор, ответ при этом не меняется.

// Полоса вопросов: номер, верно/неверно, текущий. Нажатие открывает разбор этого вопроса.
const navStrip = (current, wrong, total = 10) => {
  let cells = '';
  for (let i = 1; i <= total; i += 1) {
    const state = wrong.includes(i) ? 'wrong' : 'right';
    const label = `Вопрос ${i}, ${state === 'wrong' ? 'неверно' : 'верно'}`;
    cells += `<a href="#" class="qnav-cell qnav-${state}"${i === current ? ' aria-current="step"' : ''} aria-label="${label}">${i}</a>`;
  }
  return `<nav class="qnav" aria-label="Вопросы тренировки">${cells}</nav>`;
};

NS.add({ id: 'R19', group: 'R', name: 'Разбор тренировки — назад и вперёд по вопросам', html: `
<div class="app no-nav" data-screen="review" data-lang="ru">
  <div class="main">
    <header class="session-top sec-verbal">
      <button type="button" class="icon-btn" aria-label="Закрыть разбор"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>Разбор · Text Completion</span>
        <span class="session-count">3 из 10</span>
      </div>
    </header>
    ${navStrip(3, [3, 6, 9])}
    <div class="r-layout scroll">
      <section class="r-question">
        <div class="verdict verdict-wrong" role="status">
          <svg class="ic"><use href="#i-cross"/></svg>
          <span><b>Неверно</b> — первый пропуск верно, второй нет.</span>
        </div>
        <dl class="answer-table">
          <div class="ans-row"><dt>Пропуск (i)</dt><dd><span class="ans ans-right"><svg class="ic-sm"><use href="#i-check"/></svg>concision</span></dd></div>
          <div class="ans-row"><dt>Пропуск (ii)</dt><dd>
            <span class="ans ans-wrong"><svg class="ic-sm"><use href="#i-cross"/></svg>meticulous<small>ваш ответ</small></span>
            <span class="ans ans-right"><svg class="ic-sm"><use href="#i-check"/></svg>perfunctory<small>верно</small></span>
          </dd></div>
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
          <p class="trap"><b>Почему соблазняет meticulous.</b> Звучит как похвала отчёту, но «скрупулёзный» противоречит «dismissed».</p>
        </div>
        <div class="explain-body" data-lang-block="en">
          <p>“Brevity came at a cost” and “dismissed in a single sentence” signal that the objections were handled hastily.</p>
          <p class="trap"><b>Why meticulous tempts.</b> It sounds like praise, but “meticulous” clashes with “dismissed”.</p>
        </div>
      </section>
    </div>
    <footer class="bottom-bar qnav-bar">
      <button type="button" class="btn btn-ghost qnav-step" aria-label="Предыдущий вопрос — 2"><svg class="ic-sm"><use href="#i-back"/></svg>2</button>
      <button type="button" class="btn btn-primary">Следующий · 4<svg class="ic-sm"><use href="#i-chevron-right"/></svg></button>
    </footer>
  </div>
</div>
` });

NS.add({ id: 'R20', group: 'R', name: '«Практика» — вернулась к прошлому вопросу', html: `
<div class="app no-nav" data-screen="question">
  <div class="main">
    <header class="session-top sec-verbal">
      <button type="button" class="icon-btn" aria-label="Закрыть тренировку"><svg class="ic"><use href="#i-close"/></svg></button>
      <div class="session-meta">
        <span class="session-sec"><span class="sec-dot"></span>Verbal · Text Completion</span>
        <span class="qnav-pager">
          <button type="button" class="icon-btn qnav-arrow" aria-label="Предыдущий вопрос — 1"><svg class="ic-sm"><use href="#i-back"/></svg></button>
          <span class="session-count">2 из 10</span>
          <button type="button" class="icon-btn qnav-arrow" aria-label="Следующий вопрос — 3"><svg class="ic-sm"><use href="#i-chevron-right"/></svg></button>
        </span>
      </div>
      <div class="session-bar" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="3" aria-label="Пройдено 3 из 10"><span style="width:30%"></span></div>
    </header>
    <div class="q-layout scroll">
      <section class="q-stem">
        <div class="qnav-past" role="status"><svg class="ic-sm"><use href="#i-check"/></svg><span>Вы уже ответили — верно. Ответ не меняется.</span></div>
        <p class="q-text">The new mayor’s early speeches were so <span class="blank blank-right">conciliatory</span> that even her fiercest rivals found little to attack.</p>
      </section>
      <section class="q-answers">
        <fieldset class="opt-group" disabled>
          <legend>Ваш ответ</legend>
          <div class="opt qnav-locked" aria-checked="false"><span class="oval"></span>belligerent</div>
          <div class="opt qnav-locked qnav-locked-on" aria-checked="true"><span class="oval"></span>conciliatory</div>
          <div class="opt qnav-locked" aria-checked="false"><span class="oval"></span>evasive</div>
        </fieldset>
        <div class="explain-body"><p><b>Conciliatory</b> — примирительный: соперникам не к чему придраться. Belligerent — наоборот, воинственный.</p></div>
      </section>
    </div>
    <footer class="bottom-bar">
      <button type="button" class="btn btn-primary btn-wide">Вернуться к вопросу 4</button>
    </footer>
  </div>
</div>
` });
