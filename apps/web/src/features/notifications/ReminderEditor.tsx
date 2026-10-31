import { openAi } from '../ai/entry';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReminderDto, ReminderTarget, TaskDue } from '@research/contracts';
import { localDateTimeAt, normalizeDeadline } from '@research/domain';
import { resourceKey } from '../../app/query-client';
import { apiRequest } from '../../lib/api-client';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { reminderText as t } from '../../locales/zh-CN';
export function ReminderEditor({ userId, timezone, target, due, disabled = false }: { userId: string; timezone: string; target: ReminderTarget; due: TaskDue; disabled?: boolean }) {
  const prefix = useId();
  const query = useQuery({ queryKey: resourceKey('reminders', userId, target), queryFn: ({ signal }) => apiRequest<{ items: ReminderDto[] }>(`/reminders?targetType=${target.targetType}&targetId=${target.targetId}`, { signal }), refetchInterval: 15000 });
  const [editing, setEditing] = useState<ReminderDto | null>(null), [mode, setMode] = useState<'relative' | 'absolute'>('relative'), [offset, setOffset] = useState(30), [dateTime, setDateTime] = useState('09:00'), [local, setLocal] = useState(''), [zone, setZone] = useState(timezone), [inputError, setInputError] = useState('');
  const write = useResourceWrite<{ id: string; body: unknown }, ReminderDto>(userId, (input, key) => writeApi(`/reminders/${input.id}`, 'PATCH', input.body, key), () => { setEditing(null); });
  const cancel = useResourceWrite<ReminderDto, ReminderDto>(userId, (input, key) => writeApi(`/reminders/${input.id}`, 'DELETE', { expectedVersion: input.version }, key));
  const open = (row: ReminderDto) => {
    write.reset(); cancel.reset(); setInputError(''); setEditing(row);
    setMode(row.mode); setOffset(row.offsetMinutes); setDateTime(row.dateTime ?? '09:00'); setZone(row.timezone);
    setLocal(localDateTimeAt(row.scheduledFor, row.timezone));
  };
  const save = () => {
    setInputError('');
    if (!editing) return;
    try {
      const policy = mode === 'absolute' ? { mode, timezone: zone, at: normalizeDeadline({ localDateTime: local, timezone: zone }).at } : { mode, timezone: zone, offsetMinutes: offset, ...(due?.kind === 'date' ? { dateTime } : {}) };
      const body = { ...policy, expectedVersion: editing.version };
      write.mutate({ id: editing.id, body });
    } catch { setInputError(t.invalidTime); }
  };
  const format = (at: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(at));
  return <section className="reminder-panel" aria-label={t.title}>
    <div className="reminder-heading"><h3>{t.title}</h3>{!disabled && !editing && <button type="button" onClick={() => openAi('请为当前目标设置提醒：', { type: target.targetType, id: target.targetId }, false)}>用 AI 设置提醒</button>}</div>
    <p className="help">{t.policy}</p>
    {query.isPending && <p role="status">{t.loading}</p>}
    {query.isError && <p className="error" role="alert">{query.error.message} <button type="button" onClick={() => void query.refetch()}>{t.refresh}</button></p>}
    <ul className="reminder-list">{query.data?.items.map(row => <li key={row.id}><div><strong>{format(row.scheduledFor)}</strong><p>{t.states[row.status]} · {row.mode === 'relative' ? t.relative : t.absolute}{row.deliveryStatus === 'failed' && <span className="error"> · {t.failed}</span>}</p></div>{!disabled && !editing && <div className="reminder-actions"><button type="button" onClick={() => openAi(row.deliveryStatus === 'failed' ? '请重新安排这条提醒：' : '请调整这条提醒：', { type: 'reminder', id: row.id }, false)}>{row.deliveryStatus === 'failed' ? 'AI 重新安排' : 'AI 调整'}</button><button type="button" onClick={() => open(row)}>精确调整时间</button>{row.status === 'pending' && <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(row)}>{t.cancelReminder}</button>}</div>}</li>)}</ul>
    {cancel.isError && <p className="error" role="alert">{cancel.error.message} <button type="button" onClick={() => void query.refetch()}>{t.refresh}</button></p>}
    {editing && !disabled && <form className="reminder-form" onSubmit={event => { event.preventDefault(); if (!write.isPending) save(); }}>
      <fieldset disabled={write.isPending}>
        <label htmlFor={`${prefix}-mode`}>{t.mode}</label><select id={`${prefix}-mode`} value={mode} onChange={event => setMode(event.target.value as 'relative' | 'absolute')}><option value="relative" disabled={!due}>{t.relative}</option><option value="absolute">{t.absolute}</option></select>
        <label htmlFor={`${prefix}-zone`}>{t.timezone}</label><input id={`${prefix}-zone`} value={zone} onChange={event => setZone(event.target.value)} required />
        {mode === 'absolute' ? <><label htmlFor={`${prefix}-at`}>{t.at}</label><input id={`${prefix}-at`} type="datetime-local" step="1" value={local} onChange={event => setLocal(event.target.value)} required /><p className="help">{t.absoluteHelp}</p></> : <><label htmlFor={`${prefix}-offset`}>{t.offset}</label><input id={`${prefix}-offset`} type="number" min="0" max="525600" value={offset} onChange={event => setOffset(Number(event.target.value))} required />{due?.kind === 'date' && <><label htmlFor={`${prefix}-time`}>{t.dateTime}</label><input id={`${prefix}-time`} type="time" value={dateTime} onChange={event => setDateTime(event.target.value)} required /></>}<p className="help">{t.relativeHelp}</p></>}
      </fieldset>
      {(inputError || write.isError) && <p className="error" role="alert">{inputError || write.error?.message} <button type="button" onClick={() => void query.refetch()}>{t.refresh}</button></p>}
      <div className="dialog-actions"><button type="button" disabled={write.isPending} onClick={() => setEditing(null)}>{t.cancel}</button><button className="primary" disabled={write.isPending}>{t.save}</button></div>
    </form>}
  </section>;
}
