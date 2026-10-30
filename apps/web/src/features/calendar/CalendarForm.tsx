import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { normalizeDeadline, localDateTimeAt, calendarOffsetAt, shiftLocalTime } from '@research/domain';
import type { TaskDto, CursorPage, CalendarEventDto, CalendarBlockDto, CalendarConflict } from '@research/contracts';
import { calendarText as t, tasksText } from '../../locales/zh-CN';
import { ApiError, apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { useToast } from '../../components/Toast';
export type CalendarSelection = { kind: 'event'; value: CalendarEventDto } | { kind: 'block'; value: CalendarBlockDto };
interface Props { userId: string; timezone: string; slot: string; initial?: CalendarSelection | undefined; onSaved: () => void; onRefresh?: () => void }
type Body = Record<string, unknown>;
export function CalendarForm({ userId, timezone, slot, initial, onSaved, onRefresh }: Props) {
  const [original] = useState(initial);
  const [mode, setMode] = useState<'newTask' | 'existingTask' | 'event'>(initial?.kind === 'event' ? 'event' : 'newTask');
  const [title, setTitle] = useState(initial?.value.title ?? ''), [start, setStart] = useState(initial ? localDateTimeAt(initial.value.startAt, initial.value.timezone) : slot), [end, setEnd] = useState(initial ? localDateTimeAt(initial.value.endAt, initial.value.timezone) : shiftLocalTime(slot, 60));
  const [zone, setZone] = useState(initial?.value.timezone ?? timezone), [startOffset, setStartOffset] = useState(initial ? calendarOffsetAt(initial.value.startAt, initial.value.timezone) : ''), [endOffset, setEndOffset] = useState(initial ? calendarOffsetAt(initial.value.endAt, initial.value.timezone) : '');
  const [location, setLocation] = useState(initial?.kind === 'event' ? initial.value.location : ''), [note, setNote] = useState(initial?.kind === 'event' ? initial.value.note : ''), [url, setUrl] = useState(initial?.kind === 'event' ? initial.value.externalUrl ?? '' : '');
  const [preparation, setPreparation] = useState(''), [due, setDue] = useState(''), [taskId, setTaskId] = useState('');
  const [invalid, setInvalid] = useState('');
  const [conflict, setConflict] = useState<{ body: Body; conflicts: CalendarConflict[]; token: string } | null>(null), [accepted, setAccepted] = useState(false);
  const toast = useToast();
  const tasks = useQuery({ queryKey: resourceKey('tasks', userId, { calendarSelection: true }), enabled: !original && mode === 'existingTask', queryFn: async ({ signal }) => {
    const items: TaskDto[] = []; let cursor: string | null = null;
    do { const result: CursorPage<TaskDto> = await apiRequest(`/tasks?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }); items.push(...result.items); cursor = result.nextCursor; } while (cursor);
    return items.filter(task => !['done', 'canceled'].includes(task.status));
  } });
  const path = original ? original.kind === 'event' ? `/calendar/events/${original.value.id}` : `/schedule-blocks/${original.value.id}` : mode === 'event' ? '/calendar/events' : mode === 'existingTask' ? '/schedule-blocks' : '/calendar/tasks';
  const save = useResourceWrite<Body, unknown>(userId, (body, key) => writeApi(path, original ? 'PATCH' : 'POST', body, key), () => { toast(t.saved); onSaved(); });
  function handleError(error: Error, body: Body) {
    if (error instanceof ApiError && error.code === 'SCHEDULE_CONFLICT' && Array.isArray(error.details.conflicts) && typeof error.details.confirmationToken === 'string') { setConflict({ body, conflicts: error.details.conflicts as CalendarConflict[], token: error.details.confirmationToken }); setAccepted(false); }
  }
  function submit() {
    setInvalid('');
    let range;
    try {
      const first = normalizeDeadline({ localDateTime: start, timezone: zone, ...(startOffset ? { offset: startOffset } : {}) });
      const last = normalizeDeadline({ localDateTime: end, timezone: zone, ...(endOffset ? { offset: endOffset } : {}) });
      if (Date.parse(last.at) <= Date.parse(first.at)) throw new Error('Invalid range');
      range = { startAt: first.at, endAt: last.at, timezone: first.timezone };
    } catch { setInvalid(t.invalidTime); return; }
    let body: Body;
    if (original?.kind === 'block') body = { ...range, expectedVersion: original.value.version };
    else if (mode === 'event') body = { ...range, title: title.trim(), location, note, externalUrl: url || null, ...(original ? { expectedVersion: original.value.version } : preparation.trim() ? { preparationTask: { title: preparation.trim() } } : {}) };
    else if (mode === 'existingTask') { const task = tasks.data?.find(item => item.id === taskId); if (!task) { setInvalid(t.noTasks); return; } body = { ...range, taskId, expectedTaskVersion: task.version }; }
    else body = { task: { title: title.trim(), due: due ? { kind: 'date', date: due } : null }, schedule: range };
    save.mutate(body, { onError: error => handleError(error, body) });
  }
  return <form className="calendar-form" onSubmit={event => { event.preventDefault(); if (!save.isPending && !conflict) submit(); }}>
    <fieldset disabled={save.isPending || !!conflict}>
      {!original && <label>{t.mode}<select aria-label={t.mode} value={mode} onChange={event => { save.reset(); setMode(event.target.value as typeof mode); }}><option value="newTask">{t.newTask}</option><option value="existingTask">{t.existingTask}</option><option value="event">{t.fixedEvent}</option></select></label>}
      {original?.kind === 'block' ? <p className="calendar-task-title">{original.value.title}</p> : mode === 'existingTask' ? <label>{t.chooseTask}<select aria-label={t.chooseTask} required value={taskId} onChange={event => setTaskId(event.target.value)}><option value="">{t.chooseTask}</option>{tasks.data?.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select>{tasks.isPending && <span role="status">{t.tasksLoading}</span>}{tasks.isError && <span className="error" role="alert">{tasks.error.message}<button type="button" onClick={() => void tasks.refetch()}>{t.retry}</button></span>}{tasks.isSuccess && !tasks.data.length && <span>{t.noTasks}</span>}</label> : <label>{mode === 'event' ? t.eventTitle : t.taskTitle}<input aria-label={mode === 'event' ? t.eventTitle : t.taskTitle} data-autofocus value={title} maxLength={200} required onChange={event => setTitle(event.target.value)} /></label>}
      <div className="task-form-grid"><label>{t.start}<input type="datetime-local" step="1" required value={start} onChange={event => { setStart(event.target.value); setStartOffset(''); }} /></label><label>{t.end}<input type="datetime-local" step="1" required value={end} onChange={event => { setEnd(event.target.value); setEndOffset(''); }} /></label></div>
      <label>{t.sourceTimezone}<input required value={zone} onChange={event => { setZone(event.target.value); setStartOffset(''); setEndOffset(''); }} /></label>
      <details className="calendar-offsets"><summary>{t.offsetHelp}</summary><div className="task-form-grid"><label>{t.startOffset}<input value={startOffset} placeholder={t.offsetExample} onChange={event => setStartOffset(event.target.value)} /></label><label>{t.endOffset}<input value={endOffset} placeholder={t.offsetExample} onChange={event => setEndOffset(event.target.value)} /></label></div></details>
      {!original && mode === 'newTask' && <><label>{t.due}<input type="date" value={due} onChange={event => setDue(event.target.value)} /></label><p className="help">{t.dueHelp}</p></>}
      {mode === 'event' && original?.kind !== 'block' && <><label>{t.location}<input maxLength={200} value={location} onChange={event => setLocation(event.target.value)} /></label><label>{t.link}<input type="url" value={url} onChange={event => setUrl(event.target.value)} /></label><label>{t.note}<textarea aria-label={t.note} rows={3} maxLength={10000} value={note} onChange={event => setNote(event.target.value)} /></label>{!original && <><label>{t.preparation}<input maxLength={200} value={preparation} onChange={event => setPreparation(event.target.value)} /></label><p className="help">{t.preparationHelp}</p></>}</>}
    </fieldset>
    {invalid && <p className="error" role="alert">{invalid}</p>}
    {save.isError && !conflict && <p className="error" role="alert">{save.error.message} {save.error instanceof ApiError && save.error.code === 'VERSION_CONFLICT' && onRefresh && <button type="button" onClick={onRefresh}>{t.refresh}</button>}</p>}
    {conflict ? <div className="calendar-conflict" role="alert"><h3>{t.conflictTitle}</h3><p>{t.conflictHelp}</p><p>{start} → {end} · {zone}</p><ul>{conflict.conflicts.map(item => <li key={`${item.kind}:${item.id}`}><strong>{item.title}</strong><span>{localDateTimeAt(item.startAt, zone).replace('T', ' ')} — {localDateTimeAt(item.endAt, zone).replace('T', ' ')}</span></li>)}</ul><label className="conflict-checkbox"><input type="checkbox" checked={accepted} disabled={save.isPending} onChange={event => setAccepted(event.target.checked)} />{t.conflictAccept}</label><div className="dialog-actions"><button type="button" disabled={save.isPending} onClick={() => { setConflict(null); setAccepted(false); save.reset(); }}>{t.backToEdit}</button><button type="button" className="primary" disabled={!accepted || save.isPending} onClick={() => { const body = { ...conflict.body, conflictToken: conflict.token }; save.mutate(body, { onError: error => handleError(error, body) }); }}>{t.conflictSave}</button></div></div> : <div className="task-form-footer"><span className="help">{original ? `${tasksText.version} ${original.value.version}` : ''}</span><button className="primary" disabled={save.isPending}>{save.isPending ? t.saving : t.save}</button></div>}
  </form>;
}
