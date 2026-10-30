import { useState } from 'react';
import type { TaskDto } from '@research/contracts';
import { tasksText as t } from '../../locales/zh-CN';
import { useToast } from '../../components/Toast';
import { useResourceWrite, writeApi } from './task-api';
export function TaskQuickCreate({ userId }: { userId: string }) {
  const [title, setTitle] = useState('');
  const toast = useToast();
  const create = useResourceWrite<string, TaskDto>(userId, (value, key) => writeApi('/tasks', 'POST', { title: value }, key), () => { setTitle(''); toast(t.created); });
  return <form className="task-quick-create" onSubmit={event => { event.preventDefault(); if (title.trim() && !create.isPending) create.mutate(title.trim()); }}>
    <div><label className="sr-only" htmlFor="quick-task-title">{t.title}</label><input id="quick-task-title" value={title} maxLength={200} required placeholder={t.quickPlaceholder} disabled={create.isPending} onChange={event => setTitle(event.target.value)} /><button className="primary" disabled={!title.trim() || create.isPending}>{create.isPending ? t.creating : t.quickCreate}</button></div>
    {create.isError && <p className="error" role="alert">{create.error.message}</p>}
  </form>;
}
