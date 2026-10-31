import { ResourceOverview } from '../../components/ResourceOverview';
import { AiEntry } from '../ai/AiEntry';
import { ReminderPanel as ReminderEditor } from '../notifications/ReminderPanel';
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
    <AiEntry scope={{ type: snapshot.kind, id: snapshot.value.id }} placeholder="调整这项日程，或为事件设置提醒……" />
    <ResourceOverview fields={[['标题', snapshot.value.title], ['开始', new Date(snapshot.value.startAt).toLocaleString('zh-CN', { timeZone: snapshot.value.timezone })], ['结束', new Date(snapshot.value.endAt).toLocaleString('zh-CN', { timeZone: snapshot.value.timezone })], ['时区', snapshot.value.timezone], ...(snapshot.kind === 'event' ? [['地点', snapshot.value.location || '未设置'], ['备注', snapshot.value.note || '暂无备注']] as [string, string][] : [])]} /><details className="precision-edit"><summary>精确调整日程字段</summary><CalendarForm userId={userId} timezone={timezone} slot="" initial={snapshot} onSaved={onSaved} onRefresh={onRefresh} /></details>
    {snapshot.kind === 'block' ? <Link className="calendar-task-link" href={`/tasks/${snapshot.value.taskId}`}>{t.taskLink} →</Link> : snapshot.value.preparationTasks.length > 0 && <div className="calendar-preparation"><h3>{t.preparationTasks}</h3>{snapshot.value.preparationTasks.map(task => <Link key={task.id} href={`/tasks/${task.id}`}>{task.title} →</Link>)}</div>}
    {snapshot.kind === 'event' && <ReminderEditor userId={userId} timezone={timezone} target={{ targetType: 'event', targetId: snapshot.value.id }} due={{ kind: 'instant', at: snapshot.value.startAt, timezone: snapshot.value.timezone }} />}
    <div className="calendar-remove">
      {confirm ? <><p>{snapshot.kind === 'event' ? t.removeHelp : t.cancelHelp}</p><div className="dialog-actions"><button type="button" disabled={remove.isPending} onClick={() => setConfirm(false)}>{t.cancel}</button><button type="button" className="danger" disabled={remove.isPending} onClick={() => remove.mutate({ expectedVersion: snapshot.value.version })}>{t.confirm}</button></div></> : <button type="button" className="danger" onClick={() => setConfirm(true)}>{snapshot.kind === 'event' ? t.removeEvent : t.cancelBlock}</button>}
      {remove.isError && <p className="error" role="alert">{remove.error.message} {remove.error instanceof ApiError && remove.error.status === 409 && <button type="button" onClick={onRefresh}>{t.refresh}</button>}</p>}
    </div>
  </>;
}
