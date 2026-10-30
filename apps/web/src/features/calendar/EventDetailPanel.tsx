import { useState } from 'react';
import { calendarText as t } from '../../locales/zh-CN';
import { CalendarForm } from './CalendarForm';
import type { CalendarSelection } from './CalendarForm';
import { useResourceWrite, writeApi } from '../tasks/task-api';
import { useToast } from '../../components/Toast';
import { Link } from '../../app/router';
import { ApiError } from '../../lib/api-client';
export function EventDetailPanel({ initial, userId, timezone, onSaved, onRefresh }: { initial: CalendarSelection; userId: string; timezone: string; onSaved: () => void; onRefresh: () => void }) {
  const [snapshot] = useState(initial), [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const remove = useResourceWrite<{ expectedVersion: number }, unknown>(userId, (body, key) => writeApi(snapshot.kind === 'event' ? `/calendar/events/${snapshot.value.id}` : `/schedule-blocks/${snapshot.value.id}`, 'DELETE', body, key), () => { toast(t.removed); onSaved(); });
  return <>
    <CalendarForm userId={userId} timezone={timezone} slot="" initial={snapshot} onSaved={onSaved} onRefresh={onRefresh} />
    {snapshot.kind === 'block' ? <Link className="calendar-task-link" href={`/tasks/${snapshot.value.taskId}`}>{t.taskLink} →</Link> : snapshot.value.preparationTasks.length > 0 && <div className="calendar-preparation"><h3>{t.preparationTasks}</h3>{snapshot.value.preparationTasks.map(task => <Link key={task.id} href={`/tasks/${task.id}`}>{task.title} →</Link>)}</div>}
    <div className="calendar-remove">
      {confirm ? <><p>{snapshot.kind === 'event' ? t.removeHelp : t.cancelHelp}</p><div className="dialog-actions"><button type="button" disabled={remove.isPending} onClick={() => setConfirm(false)}>{t.cancel}</button><button type="button" className="danger" disabled={remove.isPending} onClick={() => remove.mutate({ expectedVersion: snapshot.value.version })}>{t.confirm}</button></div></> : <button type="button" className="danger" onClick={() => setConfirm(true)}>{snapshot.kind === 'event' ? t.removeEvent : t.cancelBlock}</button>}
      {remove.isError && <p className="error" role="alert">{remove.error.message} {remove.error instanceof ApiError && remove.error.status === 409 && <button type="button" onClick={onRefresh}>{t.refresh}</button>}</p>}
    </div>
  </>;
}
