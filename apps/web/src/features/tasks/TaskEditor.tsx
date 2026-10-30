import { useState } from 'react';
import { CreateTaskSchema, UpdateTaskSchema } from '@research/contracts';
import type { TaskDto, CreateTaskInput, UpdateTaskInput } from '@research/contracts';
import { tasksText as t } from '../../locales/zh-CN';
import { useResourceWrite, useProjects, writeApi } from './task-api';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/api-client';
interface Props { userId: string; timezone: string; task?: TaskDto; onSaved?: (task: TaskDto) => void; onRefresh?: () => void }
export function TaskEditor({ userId, timezone, task, onSaved, onRefresh }: Props) {
  const [initial] = useState(task);
  const [fields, setFields] = useState({ title: task?.title ?? '', type: task?.type ?? 'other', status: task?.status ?? 'inbox', priority: task?.priority ?? 'normal', projectId: task?.projectId ?? '', duration: task?.durationMinutes?.toString() ?? '', note: task?.note ?? '', externalUrl: task?.externalUrl ?? '' });
  const [kind, setKind] = useState<'none' | 'date' | 'instant'>(task?.due?.kind ?? 'none');
  const [date, setDate] = useState(task?.due?.kind === 'date' ? task.due.date : '');
  const [instant, setInstant] = useState(task?.due?.kind === 'instant' ? task.due.at : '');
  const [sourceTimezone, setSourceTimezone] = useState(task?.due?.kind === 'instant' ? task.due.timezone : timezone);
  const [invalid, setInvalid] = useState(false);
  const projects = useProjects(userId), toast = useToast();
  const save = useResourceWrite<CreateTaskInput | UpdateTaskInput, TaskDto>(userId,
    (body, key) => writeApi(initial ? `/tasks/${initial.id}` : '/tasks', initial ? 'PATCH' : 'POST', body, key),
    result => { toast(initial ? t.saved : t.created); onSaved?.(result); });
  function submit() {
    const base = { title: fields.title, type: fields.type, priority: fields.priority, projectId: fields.projectId || null, durationMinutes: fields.duration === '' ? null : Number(fields.duration), note: fields.note, externalUrl: fields.externalUrl || null, due: kind === 'date' ? { kind: 'date', date } : kind === 'instant' ? { kind: 'instant', at: instant, timezone: sourceTimezone } : null };
    const parsed = initial ? UpdateTaskSchema.safeParse({ ...base, status: fields.status, expectedVersion: initial.version }) : CreateTaskSchema.safeParse(base);
    setInvalid(!parsed.success);
    if (parsed.success && !save.isPending) save.mutate(parsed.data);
  }
  const input = (name: keyof typeof fields, value: string) => setFields(current => ({ ...current, [name]: value }));
  return <form className="task-editor" onSubmit={event => { event.preventDefault(); submit(); }}>
    <fieldset disabled={save.isPending}>
      <label>{t.title}<input data-autofocus value={fields.title} onChange={event => input('title', event.target.value)} maxLength={200} required /></label>
      <div className="task-form-grid">
        <label>{t.type}<select aria-label={t.type} value={fields.type} onChange={event => input('type', event.target.value)}>{Object.entries(t.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>{t.priority}<select aria-label={t.priority} value={fields.priority} onChange={event => input('priority', event.target.value)}>{Object.entries(t.priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {initial && <label>{t.status}<select aria-label={t.status} value={fields.status} onChange={event => input('status', event.target.value)}>{Object.entries(t.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <label>{t.project}<select aria-label={t.project} value={fields.projectId} onChange={event => input('projectId', event.target.value)} disabled={projects.isPending || projects.isError}><option value="">{t.noProject}</option>{projects.data?.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>{t.duration}<input type="number" min="0" max="1440" step="1" value={fields.duration} onChange={event => input('duration', event.target.value)} /></label>
        <label>{t.deadlineKind}<select aria-label={t.deadlineKind} value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="none">{t.none}</option><option value="date">{t.dateOnly}</option><option value="instant">{t.instant}</option></select></label>
        {kind === 'date' && <label>{t.date}<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>}
        {kind === 'instant' && <><label>{t.instantAt}<input required value={instant} onChange={event => setInstant(event.target.value)} placeholder="2026-11-10T23:59:59+08:00" /></label><label>{t.timezone}<input required value={sourceTimezone} onChange={event => setSourceTimezone(event.target.value)} /></label></>}
      </div>
      <p className="help">{kind === 'instant' ? t.instantHelp : t.scheduleNote}</p>
      {projects.isError && <p className="error" role="alert">{t.projectUnavailable} <button type="button" onClick={() => void projects.refetch()}>{t.retry}</button></p>}
      <label>{t.externalUrl}<input type="url" value={fields.externalUrl} onChange={event => input('externalUrl', event.target.value)} placeholder="https://" /></label>
      <label>{t.note}<textarea aria-label={t.note} rows={4} maxLength={10000} value={fields.note} onChange={event => input('note', event.target.value)} /></label>
    </fieldset>
    {invalid && <p className="error" role="alert">{t.invalidInput}</p>}
    {save.isError && <p className="error" role="alert">{save.error.message} {save.error instanceof ApiError && save.error.status === 409 && onRefresh && <button type="button" onClick={onRefresh}>{t.refresh}</button>}</p>}
    <div className="task-form-footer"><span className="help">{initial ? `${t.version} ${initial.version}` : ''}</span><button className="primary" disabled={save.isPending}>{save.isPending ? t.saving : initial ? t.save : t.create}</button></div>
  </form>;
}
