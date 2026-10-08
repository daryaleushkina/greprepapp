// Тексты интерфейса на двух языках. Те же строки, что в приложении Apple (apps/apple, Localizable.xcstrings):
// у человека один продукт на всех платформах. Термины GRE (Verbal, Quant) — по-английски и в русском интерфейсе,
// как на экзамене. Кавычки в русском — только «ёлочки».
import type { Locale } from './locale';

type Plural = (n: number) => string;

const ruRules = new Intl.PluralRules('ru');
const enRules = new Intl.PluralRules('en');

/** Русские формы: one — 1, 21; few — 2–4, 22–24; many — 5–20, 25–30; other — дроби. */
function ru(forms: { one: string; few: string; many: string; other: string }): Plural {
  return (n) => {
    const rule = ruRules.select(n);
    const form = rule === 'one' ? forms.one : rule === 'few' ? forms.few : rule === 'many' ? forms.many : forms.other;
    return form.replace('#', String(n));
  };
}

function en(one: string, other: string): Plural {
  return (n) => (enRules.select(n) === 'one' ? one : other).replace('#', String(n));
}

/** Число шагов — словом: при трёх-четырёх шагах слово читается быстрее цифры (шагов не больше восьми, договор). */
const ruSteps = ['', 'Один шаг', 'Два шага', 'Три шага', 'Четыре шага', 'Пять шагов', 'Шесть шагов', 'Семь шагов', 'Восемь шагов'];
const enSteps = ['', 'One step', 'Two steps', 'Three steps', 'Four steps', 'Five steps', 'Six steps', 'Seven steps', 'Eight steps'];


const trainingRu = {
  training_new: "Новая тренировка",
  training_own: "Своя тренировка",
  training_continue: "Продолжить тренировку",
  training_continue_subtitle: (section: string, position: number, total: number) => `${section} · вопрос\u00a0${position}\u00a0из\u00a0${total}`,
  training_loading: "Загружаем темы",
  training_storage_title: "Нет места на устройстве",
  training_storage_message: "Не получилось сохранить тренировку на устройстве. Освободите место и попробуйте снова.",
  training_offline_title: "Нет сети",
  training_offline_message: "Чтобы начать тренировку, нужна сеть: задания скачаются целиком, и дальше можно без неё.",
  training_failed_title: "Не получилось загрузить темы",
  training_failed_message: "Мы уже знаем об ошибке. Попробуйте ещё раз чуть позже.",
  training_retry: "Повторить",
  training_missing_title: "Тренировки нет на устройстве",
  training_missing_message: "Она могла устареть. Начните новую с экрана «Сегодня».",
  question_close: "Закрыть тренировку",
  builder_preset_last: "Как в прошлый раз",
  builder_preset_timed: "Проверка на время",
  builder_preset_timed_subtitle: (section: string, count: string, minutes: number) => `${section} · ${count} · ${minutes}\u00a0мин, как секция экзамена`,
  builder_section: "Раздел",
  builder_type: "Тип",
  builder_count: "Вопросов",
  builder_mode: "Режим",
  builder_topics: "Темы и сложность",
  builder_topics_all: "все",
  builder_topics_some: (selected: number, total: number) => `${selected} из ${total}`,
  builder_type_soon: "скоро",
  builder_start: (count: string, minutes: number) => `Начать · ${count} · ~${minutes}\u00a0мин`,
  builder_nothing: "Заданий пока нет",
  builder_no_questions: "Под этот выбор заданий пока нет — попробуйте другие темы или сложность.",
  builder_start_offline: "Нет сети — тренировку не начать. Попробуйте, когда она появится.",
  builder_start_failed: "Не получилось начать тренировку. Попробуйте ещё раз.",
  mode_practice: "Практика",
  mode_check: "Проверка",
  mode_practice_hint: "Разбор после каждого вопроса, без таймера",
  mode_check_hint: "Таймер как на экзамене, разбор в конце",
  difficulty_any: "Любая",
  difficulty_easy: "Лёгкая",
  difficulty_medium: "Средняя",
  difficulty_hard: "Трудная",
  topics_difficulty: "Сложность",
  topics_done: (count: string) => `Готово · ${count}`,
};
const trainingEn = {
  training_new: "New practice",
  training_own: "Custom practice",
  training_continue: "Continue practice",
  training_continue_subtitle: (section: string, position: number, total: number) => `${section} · question\u00a0${position}\u00a0of\u00a0${total}`,
  training_loading: "Loading topics",
  training_storage_title: "No space on the device",
  training_storage_message: "Couldn’t save the practice on your device. Free up some space and try again.",
  training_offline_title: "No connection",
  training_offline_message: "Starting a practice needs a connection: the questions download in full, and after that you can go offline.",
  training_failed_title: "Couldn’t load topics",
  training_failed_message: "We already know about it. Please try again a little later.",
  training_retry: "Try again",
  training_missing_title: "This practice isn’t on the device",
  training_missing_message: "It may have expired. Start a new one from Today.",
  question_close: "Close practice",
  builder_preset_last: "Same as last time",
  builder_preset_timed: "Timed check",
  builder_preset_timed_subtitle: (section: string, count: string, minutes: number) => `${section} · ${count} · ${minutes}\u00a0min, like an exam section`,
  builder_section: "Section",
  builder_type: "Type",
  builder_count: "Questions",
  builder_mode: "Mode",
  builder_topics: "Topics and difficulty",
  builder_topics_all: "all",
  builder_topics_some: (selected: number, total: number) => `${selected} of ${total}`,
  builder_type_soon: "soon",
  builder_start: (count: string, minutes: number) => `Start · ${count} · ~${minutes}\u00a0min`,
  builder_nothing: "No questions yet",
  builder_no_questions: "No questions match this yet — try other topics or difficulty.",
  builder_start_offline: "No connection — the practice can’t start. Try again once you’re online.",
  builder_start_failed: "Couldn’t start the practice. Please try again.",
  mode_practice: "Practice",
  mode_check: "Check",
  mode_practice_hint: "Explanation after each question, no timer",
  mode_check_hint: "Exam-pace timer, explanations at the end",
  difficulty_any: "Any",
  difficulty_easy: "Easy",
  difficulty_medium: "Medium",
  difficulty_hard: "Hard",
  topics_difficulty: "Difficulty",
  topics_done: (count: string) => `Done · ${count}`,
};
type TrainingDict = typeof trainingRu & { questionsCount: Plural };

export interface Dict {
  training: TrainingDict;
  back: string;
  tabs: { today: string; words: string; exam: string; progress: string; settings: string; sections: string };
  sections: { verbal: string; quant: string; words: string; essay: string };
  today: {
    title: string;
    plan: string;
    loading: string;
    steps: Plural;
    aboutMinutes: Plural;
    minutes: Plural;
    approxShort: (n: number) => string;
    short: (n: number) => string;
    noSteps: string;
    start: string;
    now: (title: string) => string;
    allDoneLine: string;
    allDoneTitle: string;
    tomorrow: string;
    offlineTitle: string;
    offlineText: string;
    failedTitle: string;
    failedText: string;
    retry: string;
    staleOffline: string;
    staleFailed: string;
    needNetwork: string;
  };
  placeholder: { soon: string; words: string; exam: string; step: string };
  progress: { emptyTitle: string; emptyText: string };
  settings: { signOut: string; signOutFailed: string; signOutOffline: string; version: (v: string) => string };
  signIn: {
    tagline: string;
    telegram: string;
    apple: string;
    google: string;
    legal: string;
    notConnected: Record<'telegram' | 'apple' | 'google', string>;
    offline: string;
    tooMany: string;
    failed: string;
    /** Заголовок экрана, когда войти не вышло совсем (мини-апп): коротко, совет — строкой ниже. */
    failedTitle: string;
    cancelled: string;
    expired: string;
    devTitle: string;
    devName: string;
    devSubmit: string;
    signingIn: string;
  };
  crash: { title: string; text: string; reload: string };
  telegramFailed: { title: string; text: string };
}

const dictRu: Dict = {
  training: { ...trainingRu, questionsCount: ru({ one: "#\u00a0вопрос", few: "#\u00a0вопроса", many: "#\u00a0вопросов", other: "#\u00a0вопроса" }) },
  back: 'Назад',
  tabs: { today: 'Сегодня', words: 'Слова', exam: 'Экзамен', progress: 'Прогресс', settings: 'Настройки', sections: 'Разделы' },
  sections: { verbal: 'Verbal', quant: 'Quant', words: 'Слова', essay: 'Эссе' },
  today: {
    title: 'Сегодня',
    plan: 'План на сегодня',
    loading: 'Загружаем план на сегодня',
    steps: (n) => ruSteps[n] ?? ru({ one: '# шаг', few: '# шага', many: '# шагов', other: '# шага' })(n),
    aboutMinutes: ru({ one: 'около # минуты', few: 'около # минут', many: 'около # минут', other: 'около # минуты' }),
    minutes: ru({ one: '# минута', few: '# минуты', many: '# минут', other: '# минуты' }),
    approxShort: (n) => `~${n} мин`,
    short: (n) => `${n} мин`,
    noSteps: 'На сегодня шагов нет',
    start: 'Начать',
    now: (title) => `Сейчас: ${title}`,
    allDoneLine: 'На сегодня всё.',
    allDoneTitle: 'На сегодня всё',
    tomorrow: 'Завтра здесь будет новый план.',
    offlineTitle: 'Нет сети',
    offlineText: 'План на сегодня загрузится, когда появится сеть.',
    failedTitle: 'Не получилось загрузить план',
    failedText: 'Мы уже знаем об ошибке. Попробуйте ещё раз чуть позже.',
    retry: 'Повторить',
    staleOffline: 'Нет сети — план обновится сам, когда она появится.',
    staleFailed: 'Не получилось обновить план — покажем свежий, как только сервер ответит.',
    needNetwork: 'Чтобы начать, нужна сеть. Когда она появится, всё заработает.',
  },
  placeholder: {
    soon: 'Скоро',
    words: 'Здесь будет словарь: слова на сегодня, повторение и поиск.',
    exam: 'Здесь будут пробный экзамен как настоящий GRE и эссе с оценкой.',
    step: 'Здесь начнётся шаг. Тренировки и слова появятся в следующих частях.',
  },
  progress: {
    emptyTitle: 'Тренировок ещё не было',
    emptyText: 'Здесь появятся темы, где больше всего ошибок, — по порядку, с чего начать.',
  },
  settings: {
    signOut: 'Выйти',
    signOutFailed: 'Не получилось выйти. Попробуйте ещё раз.',
    signOutOffline: 'Нет сети — выйти получится, когда она появится.',
    version: (v) => `Версия ${v}`,
  },
  signIn: {
    tagline: 'Подготовка к GRE® с разбором каждой ошибки — по-русски и по-английски.',
    telegram: 'Войти через Telegram',
    apple: 'Вход с Apple',
    google: 'Войти с аккаунтом Google',
    legal: 'Продолжая, вы принимаете условия и политику конфиденциальности.',
    notConnected: {
      telegram: 'Вход через Telegram ещё не подключён — он появится до беты.',
      apple: 'Вход с Apple ещё не подключён — он появится до беты.',
      google: 'Вход через Google ещё не подключён — он появится до беты.',
    },
    offline: 'Нет сети — войти получится, когда она появится.',
    tooMany: 'Слишком много попыток подряд — подождите минуту.',
    failed: 'Не получилось войти. Попробуйте ещё раз.',
    failedTitle: 'Не получилось войти',
    cancelled: 'Вход отменён — можно попробовать снова.',
    expired: 'Вход закончился — войдите снова.',
    devTitle: 'Для разработки — вход подменой',
    devName: 'Имя тестового пользователя',
    devSubmit: 'Войти',
    signingIn: 'Входим…',
  },
  crash: {
    title: 'Что-то пошло не так',
    text: 'Мы уже знаем об ошибке. Обновите страницу — всё сохранено.',
    reload: 'Обновить',
  },
  telegramFailed: {
    title: 'Не получилось открыть в Telegram',
    text: 'Обновите Telegram и откройте приложение снова — мы уже знаем об ошибке.',
  },
};

const dictEn: Dict = {
  training: { ...trainingEn, questionsCount: en("#\u00a0question", "#\u00a0questions") },
  back: 'Back',
  tabs: { today: 'Today', words: 'Words', exam: 'Exam', progress: 'Progress', settings: 'Settings', sections: 'Sections' },
  sections: { verbal: 'Verbal', quant: 'Quant', words: 'Words', essay: 'Essay' },
  today: {
    title: 'Today',
    plan: 'Today’s plan',
    loading: 'Loading today’s plan',
    steps: (n) => enSteps[n] ?? en('# step', '# steps')(n),
    aboutMinutes: en('about # minute', 'about # minutes'),
    minutes: en('# minute', '# minutes'),
    approxShort: (n) => `~${n} min`,
    short: (n) => `${n} min`,
    noSteps: 'No steps for today',
    start: 'Start',
    now: (title) => `Now: ${title}`,
    allDoneLine: 'That’s all for today.',
    allDoneTitle: 'That’s all for today',
    tomorrow: 'Tomorrow there will be a new plan here.',
    offlineTitle: 'No connection',
    offlineText: 'Today’s plan will load once you’re back online.',
    failedTitle: 'Couldn’t load the plan',
    failedText: 'We already know about the error. Please try again a bit later.',
    retry: 'Try again',
    staleOffline: 'No connection — the plan will update by itself once it’s back.',
    staleFailed: 'Couldn’t update the plan — we’ll show a fresh one as soon as the server responds.',
    needNetwork: 'You need a connection to start. Once it’s back, everything will work.',
  },
  placeholder: {
    soon: 'Coming soon',
    words: 'The dictionary will live here: today’s words, review and search.',
    exam: 'Practice tests just like the real GRE and scored essays will live here.',
    step: 'The step will start here. Practice and words arrive in the next parts.',
  },
  progress: {
    emptyTitle: 'No practice yet',
    emptyText: 'Topics with the most mistakes will appear here — in order, starting with the first to work on.',
  },
  settings: {
    signOut: 'Sign out',
    signOutFailed: 'Couldn’t sign out. Please try again.',
    signOutOffline: 'No connection — you can sign out once it’s back.',
    version: (v) => `Version ${v}`,
  },
  signIn: {
    tagline: 'GRE® prep that explains every mistake — in Russian and in English.',
    telegram: 'Log in with Telegram',
    apple: 'Sign in with Apple',
    google: 'Sign in with Google',
    legal: 'By continuing, you accept the terms and the privacy policy.',
    notConnected: {
      telegram: 'Log-in with Telegram isn’t connected yet — it will be before the beta.',
      apple: 'Sign in with Apple isn’t connected yet — it will be before the beta.',
      google: 'Sign-in with Google isn’t connected yet — it will be before the beta.',
    },
    offline: 'No connection — you can sign in once it’s back.',
    tooMany: 'Too many attempts in a row — please wait a minute.',
    failed: 'Couldn’t sign in. Please try again.',
    failedTitle: 'Couldn’t sign in',
    cancelled: 'Sign-in was cancelled — you can try again.',
    expired: 'You were signed out — please sign in again.',
    devTitle: 'Development only — fake sign-in',
    devName: 'Test user name',
    devSubmit: 'Sign in',
    signingIn: 'Signing in…',
  },
  crash: {
    title: 'Something went wrong',
    text: 'We already know about the error. Reload the page — everything is saved.',
    reload: 'Reload',
  },
  telegramFailed: {
    title: 'Couldn’t open in Telegram',
    text: 'Update Telegram and open the app again — we already know about the error.',
  },
};

export const dictionaries: Readonly<Record<Locale, Dict>> = { ru: dictRu, en: dictEn };

/** Дисклеймер ETS — всегда по-английски (PRODUCT.md, «Brand Commitments»). */
export const GRE_DISCLAIMER =
  'GRE® is a registered trademark of Educational Testing Service (ETS). This product is not endorsed or approved by ETS.';
