import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TaskDto } from '@research/contracts';
import { ApiError, apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { Link, navigate } from '../../app/router';
import { EmptyState } from '../../components/EmptyState';
import { text, tasksText as t } from '../../locales/zh-CN';
import { TaskEditor } from './TaskEditor';
import { TaskActions } from './TaskActions';
export function TaskDetailPanel({ userId, timezone, id }: { userId: string; timezone: string; id: string }) {
  const [revision, setRevision] = useState(0);
  const task = useQuery({ queryKey: resourceKey('task', userId, { id }), queryFn: ({ signal }) => apiRequest<TaskDto>(`/tasks/${encodeURIComponent(id)}`, { signal }) });
  const refresh = async () => { const result = await task.refetch(); if (result.isSuccess) setRevision(current => current + 1); };
  return <>
    <Link href="/tasks" className="back-link">← {t.back}</Link>
    <div className="page-heading"><h1>{text.taskDetail}</h1></div>
    {task.isPending ? <p role="status">{t.detailLoading}</p> : task.isError ? task.error instanceof ApiError && task.error.status === 404 ? <EmptyState title={t.notFound} description={t.notFoundHelp} /> : <div role="alert"><p className="error">{task.error.message}</p><button type="button" onClick={() => void refresh()}>{t.retry}</button></div> : <div className="task-detail-panel"><TaskEditor key={`${id}:${revision}`} task={task.data} userId={userId} timezone={timezone} onSaved={() => setRevision(current => current + 1)} onRefresh={() => void refresh()} /><TaskActions task={task.data} userId={userId} onDeleted={() => navigate('/tasks')} onChanged={() => setRevision(current => current + 1)} onRefresh={() => void refresh()} /></div>}
  </>;
}
