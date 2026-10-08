import { isApiError, schemas, type TrainingOptions } from '@greprep/api-client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { BackIcon, ChevronRightIcon } from '../components/icons';
import { StatusScreen } from '../components/StatusScreen';
import { useI18n } from '../i18n/i18n';
import { FocusLayout } from '../layout/AppLayout';
import { useShell } from '../shellContext';
import { useSession } from '../session/session';
import { useBackButton } from '../telegram/hooks';
import { useOnline } from '../useOnline';
import glass from '../styles/glass.module.css';
import { TrainingAction } from './Action';
import { TYPE_LABELS, available, defaultForm, formOf, initialBuilder, minutes, presetsOf, requestOf, toggleTopic, topicsOf, updateOptions, type BuilderForm } from './builder';
import { useTrainingStorage } from './hooks';
import { trainingRepository } from './repository';
import styles from './Training.module.css';

export function BuilderScreen() {
  const { session } = useSession();
  const online = useOnline();
  const options = useQuery({ queryKey: ['training-options', session.status === 'signedIn' ? session.user.id : null],
    queryFn: ({ signal }) => trainingRepository.options(signal), enabled: session.status === 'signedIn',
    // Последняя сборка меняется после старта: новый вход получает свежий каталог, редактирование его не перезагружает.
    staleTime: 0, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false });
  const offline = !online || options.fetchStatus === 'paused' || (isApiError(options.error) && options.error.kind === 'network');
  if (options.data && options.isFetchedAfterMount) return <ReadyBuilder key={session.status === 'signedIn' ? session.user.id : 'signedOut'} options={options.data} />;
  return <BuilderStatus offline={offline} unavailable={options.isError} retry={() => void options.refetch()} />;
}

/** Отдельный владелец BackButton: загрузка и готовый конструктор никогда не подписаны одновременно. */
function BuilderStatus({ offline, unavailable, retry }: { offline: boolean; unavailable: boolean; retry: () => void }) {
  const { t } = useI18n();
  const { shell } = useShell();
  const navigate = useNavigate();
  useBackButton(shell === 'telegram' ? () => void navigate({ to: '/' }) : null);
  return <FocusLayout glow="verbal"><div className={styles.screen}>
    {shell === 'site' && <Link to="/" className={styles.back}><BackIcon />{t.back}</Link>}
    <h1 className={styles.title}>{t.training.training_new}</h1>
    {unavailable || offline ? <StatusScreen heading="h2" live title={offline ? t.training.training_offline_title : t.training.training_failed_title}
      text={offline ? t.training.training_offline_message : t.training.training_failed_message}
      action={{ label: t.training.training_retry, onClick: retry }} /> : <p role="status">{t.training.training_loading}</p>}
  </div></FocusLayout>;
}

function ReadyBuilder({ options }: { options: TrainingOptions }) {
  const { t, locale } = useI18n();
  const text = t.training;
  const { shell } = useShell();
  const navigate = useNavigate();
  const search = useSearch({ from: '/app/training/new' });
  const [savedState, setState] = useState(() => initialBuilder(options, search.section, search.type));
  const state = updateOptions(savedState, options);
  if (state !== savedState) setState(state);
  const [topics, setTopics] = useState(false);
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const [problem, setProblem] = useState<'offline' | 'failed' | 'noQuestions' | null>(null);
  const online = useOnline();
  const storage = useTrainingStorage();
  const { form } = state;
  const presets = presetsOf(options);
  const preset = presets[state.preset ?? -1];
  const multipleTypes = (preset?.request.questionTypes.length ?? 0) > 1;
  const selectedTopics = topicsOf(state);
  const request = requestOf(state);
  const countLabel = text.questionsCount(request?.count ?? available(state));
  const edit = (change: (form: BuilderForm) => BuilderForm) => {
    setState((previous) => ({ ...previous, form: change(previous.form), preset: undefined }));
    setProblem(null);
  };
  const back = () => topics ? setTopics(false) : void navigate({ to: '/' });
  useBackButton(shell === 'telegram' ? back : null);

  const start = async () => {
    // Два сообщения моста могут прийти до следующего рендера: состояние ещё не выключило MainButton.
    if (starting.current || !request || storage !== 'ready') return;
    if (!online) { setProblem('offline'); return; }
    starting.current = true;
    setBusy(true); setProblem(null);
    try {
      const trainingId = await trainingRepository.start(request);
      await navigate({ to: '/training/$trainingId', params: { trainingId } });
    } catch (error) {
      setProblem(isApiError(error) && error.kind === 'network' ? 'offline' : isApiError(error) && error.code === 'no_questions' ? 'noQuestions' : 'failed');
    } finally { starting.current = false; setBusy(false); }
  };

  return <FocusLayout glow={form.section} training wide={!topics}><div className={styles.screen} data-shell={shell}>
    {shell === 'site' && <button type="button" className={styles.back} onClick={back}><BackIcon />{t.back}</button>}
    <h1 className={styles.title}>{topics ? text.builder_topics : text.training_new}</h1>
    {topics ? <>
      <p className={styles.section} data-section={form.section}>{t.sections[form.section]} · <span lang="en">{TYPE_LABELS[form.type]}</span></p>
      <div className={`${styles.group} ${glass.strong}`}>
        {selectedTopics.map((topic) => <label className={styles.row} key={topic.id}>
          <span className={styles.grow}>{topic.title[locale]}</span>
          <span className={styles.note}>{form.difficulty ? topic.available[form.difficulty] : topic.available.easy + topic.available.medium + topic.available.hard}</span>
          <input className={styles.switch} type="checkbox" role="switch" checked={form.topicIds === undefined || form.topicIds.includes(topic.id)}
            onChange={() => edit(() => toggleTopic(state, topic.id))} />
        </label>)}
      </div>
      <fieldset className={styles.difficulty}><legend>{text.topics_difficulty}</legend>
        <div className={`${styles.segments} ${glass.glass}`}>
          <button type="button" aria-pressed={form.difficulty === undefined} onClick={() => edit((f) => ({ ...f, difficulty: undefined }))}>{text.difficulty_any}</button>
          {schemas.Difficulty.options.map((difficulty) => <button type="button" key={difficulty} aria-pressed={form.difficulty === difficulty}
            onClick={() => edit((f) => ({ ...f, difficulty }))}>{text[`difficulty_${difficulty}`]}</button>)}
        </div>
      </fieldset>
      <TrainingAction text={text.topics_done(text.questionsCount(available(state)))} disabled={available(state) === 0} onClick={() => setTopics(false)} />
    </> : <>
      <div className={styles.builder}>
        {presets.length > 0 && <div className={`${styles.group} ${glass.strong}`}>
          {presets.map((preset, index) => <label key={`${preset.kind}-${index}`} className={styles.preset}>
            <span className={styles.grow}><span className={styles.presetTitle}>{preset.kind === 'last' ? text.builder_preset_last : text.builder_preset_timed}</span>
              <span className={styles.note}>{preset.kind === 'timed' ? text.builder_preset_timed_subtitle(t.sections[preset.request.section], text.questionsCount(preset.request.count), minutes(options, preset.request)) :
                `${t.sections[preset.request.section]} · ${preset.request.questionTypes.map((type) => TYPE_LABELS[type]).join(' · ')} · ${preset.request.count} · ${text[`mode_${preset.request.mode}`]}`}</span></span>
            <input type="radio" name="training-preset" checked={state.preset === index} aria-label={preset.kind === 'last' ? text.builder_preset_last : text.builder_preset_timed}
              onChange={() => { setProblem(null); setState((s) => ({ ...s, preset: index, form: formOf(preset.request, options) })); }} />
          </label>)}
        </div>}
        <div className={`${styles.group} ${styles.solid}`}>
          <div className={styles.row}><span>{text.builder_section}</span><div role="group" aria-label={text.builder_section} className={`${styles.segments} ${glass.glass}`}>
            {(['verbal', 'quant'] as const).map((section) => <button type="button" key={section} aria-pressed={form.section === section} disabled={busy}
              onClick={() => edit((f) => f.section === section ? f : { ...defaultForm(options, section), countText: f.countText, mode: f.mode })}>{t.sections[section]}</button>)}
          </div></div>
          <label className={`${styles.row} ${styles.typeRow}`}><span>{text.builder_type}</span><select lang="en" value={multipleTypes ? 'preset' : form.type} disabled={busy} onChange={(e) => {
            if (e.target.value === 'preset') return;
            const type = schemas.QuestionType.parse(e.target.value);
            edit((f) => f.type === type ? f : { ...f, type, topicIds: undefined });
          }}>{multipleTypes && <option value="preset">{preset?.request.questionTypes.map((type) => TYPE_LABELS[type]).join(' · ')}</option>}
          {options.types.filter((type) => type.section === form.section).map((type) => <option key={type.questionType} value={type.questionType} disabled={type.topics.length === 0}>
            {TYPE_LABELS[type.questionType]}{type.topics.length === 0 ? ` · ${text.builder_type_soon}` : ''}</option>)}</select></label>
          <label className={styles.row}><span>{text.builder_count}</span><input className={styles.count} inputMode="numeric" value={form.countText} disabled={busy}
            onChange={(e) => edit((f) => ({ ...f, countText: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) }))} /></label>
          <div className={styles.modeRow}><div className={styles.row}><span>{text.builder_mode}</span><div role="group" aria-label={text.builder_mode} className={`${styles.segments} ${glass.glass}`}>
            {schemas.TrainingMode.options.map((mode) => <button type="button" key={mode} disabled={busy} aria-pressed={form.mode === mode} onClick={() => edit((f) => ({ ...f, mode }))}>{text[`mode_${mode}`]}</button>)}
          </div></div><p className={styles.note}>{text[`mode_${form.mode}_hint`]}</p></div>
          <button type="button" className={styles.row} disabled={busy || selectedTopics.length === 0 || multipleTypes} onClick={() => setTopics(true)}>
            <span>{text.builder_topics}</span><span className={styles.value}><span className={styles.note}>{form.topicIds === undefined ? text.builder_topics_all : text.builder_topics_some(form.topicIds.length, selectedTopics.length)}</span><ChevronRightIcon /></span>
          </button>
        </div>
      </div>
      {(!online || problem) && <p role="alert" className={styles.note}>{!online || problem === 'offline' ? text.builder_start_offline : problem === 'noQuestions' ? text.builder_no_questions : text.builder_start_failed}</p>}
      {storage === 'unavailable' && <p role="alert" className={styles.note}>{text.training_storage_title}</p>}
      {!request && <p role="status" className={styles.note}>{text.builder_nothing}</p>}
      <TrainingAction text={request ? text.builder_start(countLabel, minutes(options, request)) : text.builder_nothing}
        disabled={!request || !online || storage !== 'ready'} busy={busy} onClick={() => void start()} />
    </>}
  </div></FocusLayout>;
}
