import { AiEntry } from '../ai/AiEntry';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TaskDto } from '@research/contracts';
import { ApiError, apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { Link, navigate } from '../../app/router';
import { EmptyState } from '../../components/EmptyState';
import { text, calendarText, tasksText as t } from '../../locales/zh-CN';
import { ReminderPanel as ReminderEditor } from '../notifications/ReminderPanel';
import { TaskEditor } from './TaskEditor';
import { TaskActions } from './TaskActions';
export function TaskDetailPanel({ userId, timezone, id, embedded = false }: { userId: string; timezone: string; id: string; embedded?: boolean }) {
  const [revision, setRevision] = useState(0);
  const task = useQuery({ queryKey: resourceKey('task', userId, { id }), queryFn: ({ signal }) => apiRequest<TaskDto>(`/tasks/${encodeURIComponent(id)}`, { signal }) });
  const refresh = async () => { const result = await task.refetch(); if (result.isSuccess) setRevision(current => current + 1); };
  return <>
    {!embedded && <Link href="/tasks" className="back-link">← {t.back}</Link>}
    {!embedded && <div className="page-heading"><h1>{text.taskDetail}</h1></div>}
    {task.isPending ? <p role="status">{t.detailLoading}</p> : task.isError ? task.error instanceof ApiError && task.error.status === 404 ? <EmptyState title={t.notFound} description={t.notFoundHelp} /> : <div role="alert"><p className="error">{task.error.message}</p><button type="button" onClick={() => void refresh()}>{t.retry}</button></div> : <div className="task-detail-panel"><AiEntry scope={{ type: 'task', id }} placeholder="调整这项任务、安排工作时段或设置提醒……" /><TaskEditor key={`${id}:${revision}`} task={task.data} userId={userId} timezone={timezone} onSaved={() => setRevision(current => current + 1)} onRefresh={() => void refresh()} /><div className="task-schedule-blocks"><h2>{calendarText.block}</h2>{task.data.scheduleBlocks.map(block => <Link key={block.id} href={`/calendar/blocks/${block.id}`}>{new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(block.startAt))} — {new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(block.endAt))} →</Link>)}</div><ReminderEditor userId={userId} timezone={timezone} target={{ targetType: 'task', targetId: id }} due={task.data.due} disabled={!!task.data.archivedAt || !!task.data.deletedAt || ['done', 'canceled'].includes(task.data.status)} /><TaskActions task={task.data} userId={userId} onDeleted={() => navigate('/tasks')} onChanged={() => setRevision(current => current + 1)} onRefresh={() => void refresh()} /></div>}
  </>;
}
