import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { CursorPage, TaskDto } from '@research/contracts';
import { apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { text, tasksText as t } from '../../locales/zh-CN';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { TaskRow } from '../../components/TaskRow';
import { TaskQuickCreate } from './TaskQuickCreate';
import { TaskEditor } from './TaskEditor';
import { ProjectManager } from './ProjectManager';
import { useProjects } from './task-api';

type Filters = Record<'q' | 'status' | 'type' | 'priority' | 'projectId' | 'due' | 'dueFrom' | 'dueTo' | 'archived', string>;
const initialFilters: Filters = { q: '', status: '', type: '', priority: '', projectId: '', due: '', dueFrom: '', dueTo: '', archived: 'false' };
function todayIn(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}
export function TasksPage({ userId, timezone, view }: { userId: string; timezone: string; view: 'today' | 'inbox' | 'all' }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [panel, setPanel] = useState<'create' | 'projects' | null>(null);
  const projects = useProjects(userId);
  const list = useInfiniteQuery({
    queryKey: resourceKey('tasks', userId, { view, ...filters }), initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) => {
      const params = new URLSearchParams({ view, limit: '30' });
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      if (pageParam) params.set('cursor', pageParam);
      return apiRequest<CursorPage<TaskDto>>(`/tasks?${params}`, { signal });
    },
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap(page => page.items) ?? [];
  const filtered = Object.entries(filters).some(([key, value]) => key === 'archived' ? value === 'true' : !!value);
  const page = view === 'all' ? 'tasks' : view;
  const change = (name: keyof Filters, value: string) => setFilters(current => ({ ...current, [name]: value }));
  const select = (name: keyof Filters, label: string, options: Record<string, string>) => <label className="filter-control"><span className="sr-only">{label}</span><select aria-label={label} value={filters[name]} onChange={event => change(name, event.target.value)}><option value="">{label}</option>{Object.entries(options).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
  const today = todayIn(timezone), now = Date.now();
  const isOverdue = (task: TaskDto) => task.status !== 'done' && task.status !== 'canceled' && !!task.due && (task.due.kind === 'date' ? task.due.date < today : Date.parse(task.due.at) < now);
  const rows = (tasks: TaskDto[], label: string) => <ul className="task-list" aria-label={label}>{tasks.map(task => <TaskRow key={task.id} task={task} userId={userId} timezone={timezone} projectName={projects.data?.find(project => project.id === task.projectId)?.name} onRefresh={() => void list.refetch()} />)}</ul>;
  const overdue = items.filter(isOverdue), done = items.filter(task => task.status === 'done'), active = items.filter(task => !isOverdue(task) && task.status !== 'done');
  return <>
    <div className="page-heading task-page-heading"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.pageLabels[page]}</h1><p className="page-description">{view === 'today' ? new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, dateStyle: 'full' }).format(new Date()) : text.pageDescriptions[page]}</p></div><div className="task-heading-actions"><button type="button" onClick={() => setPanel('projects')}>{t.projectManage}</button>{view !== 'inbox' && <button type="button" className="primary" onClick={() => setPanel('create')}>{t.advancedCreate}</button>}</div></div>
    <TaskQuickCreate userId={userId} />
    <div className="task-filters" role="search" aria-label={t.filterLabel}>
      <label className="task-search"><span className="sr-only">{t.search}</span><input type="search" value={filters.q} maxLength={200} onChange={event => change('q', event.target.value)} placeholder={t.searchPlaceholder} /></label>
      {select('type', t.allTypes, t.types)}{view !== 'inbox' && select('status', t.allStatuses, t.statuses)}{select('priority', t.allPriorities, t.priorities)}
      {select('projectId', t.allProjects, Object.fromEntries((projects.data ?? []).map(project => [project.id, project.name])))}
      {select('due', t.allDue, { today: t.dueToday, overdue: t.overdue, none: t.noDue })}
      <label className="filter-date"><span>{t.dueFrom}</span><input type="date" value={filters.dueFrom} onChange={event => change('dueFrom', event.target.value)} /></label>
      <label className="filter-date"><span>{t.dueTo}</span><input type="date" value={filters.dueTo} onChange={event => change('dueTo', event.target.value)} /></label>
      <label className="filter-control"><span className="sr-only">{t.showArchived}</span><select aria-label={t.showArchived} value={filters.archived} onChange={event => change('archived', event.target.value)}><option value="false">{t.activeTasks}</option><option value="true">{t.showArchived}</option></select></label>
      {filtered && <button type="button" className="clear-filters" onClick={() => setFilters(initialFilters)}>{t.clearFilters}</button>}
    </div>
    {projects.isError && <p className="error" role="alert">{t.projectUnavailable} <button type="button" onClick={() => void projects.refetch()}>{t.retry}</button></p>}
    {list.isPending ? <p role="status" className="list-status">{t.loading}</p> : list.isError && !list.data ? <div className="list-status" role="alert"><p className="error">{t.loadFailed}：{list.error.message}</p><button type="button" onClick={() => void list.refetch()}>{t.retry}</button></div> : items.length === 0 ? <EmptyState icon={page} title={filtered ? t.filteredEmpty : view === 'inbox' ? t.inboxEmpty : view === 'today' ? t.todayEmpty : t.allEmpty} description={filtered ? t.filteredEmptyHelp : view === 'inbox' ? t.inboxEmptyHelp : view === 'today' ? t.todayEmptyHelp : t.allEmptyHelp} /> : <>
      {view === 'today' ? <>{overdue.length > 0 && <details className="task-group" open><summary>{t.overdueGroup} <span>{overdue.length}</span></summary>{rows(overdue, t.overdueGroup)}</details>}{active.length > 0 && rows(active, t.dueGroup)}{done.length > 0 && <details className="task-group"><summary>{t.completedGroup} <span>{done.length}</span></summary>{rows(done, t.completedGroup)}</details>}</> : rows(items, text.pageLabels[page])}
      {list.isError && <p className="error" role="alert">{list.error.message} <button type="button" onClick={() => void list.refetch()}>{t.retry}</button></p>}
      {list.hasNextPage && <div className="load-more"><button type="button" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? t.loadingMore : t.loadMore}</button></div>}
    </>}
    {panel === 'create' && <Dialog title={t.createTitle} onClose={() => setPanel(null)}><TaskEditor userId={userId} timezone={timezone} onSaved={() => setPanel(null)} /></Dialog>}
    {panel === 'projects' && <ProjectManager userId={userId} onClose={() => setPanel(null)} />}
  </>;
}
