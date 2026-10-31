import { AiEntry } from '../ai/AiEntry';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { CursorPage, TaskDto } from '@research/contracts';
import { apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { Link, navigate } from '../../app/router';
import { text, tasksText as t } from '../../locales/zh-CN';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { TaskRow } from '../../components/TaskRow';
import { TaskQuickCreate } from './TaskQuickCreate';
import { TaskEditor } from './TaskEditor';
import { ProjectManager } from './ProjectManager';
import { useProjects } from './task-api';
const BatchActions = lazy(() => import('./BatchActions').then(module => ({ default: module.BatchActions })));

type Filters = Record<'q' | 'status' | 'type' | 'priority' | 'projectId' | 'due' | 'dueFrom' | 'dueTo' | 'archived', string>;
const initialFilters: Filters = { q: '', status: '', type: '', priority: '', projectId: '', due: '', dueFrom: '', dueTo: '', archived: 'false' };
function dateIn(timezone: string, at = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}
export function TasksPage({ userId, timezone, view, initialType }: { userId: string; timezone: string; view: 'today' | 'inbox' | 'all'; initialType?: TaskDto['type'] | undefined }) {
  const defaults = { ...initialFilters, type: initialType ?? '' };
  const [filters, setFilters] = useState<Filters>(defaults), [board, setBoard] = useState(false), [command, setCommand] = useState('');
  const [panel, setPanel] = useState<'create' | 'projects' | null>(null);
  useEffect(() => { setFilters(current => ({ ...current, type: initialType ?? '' })); }, [initialType]);
  useEffect(() => { const clear = () => setCommand(''); window.addEventListener('research:task-created', clear); return () => window.removeEventListener('research:task-created', clear); }, []);
  const [selecting, setSelecting] = useState(false), [selected, setSelected] = useState<Map<string, TaskDto>>(new Map());
  const stopSelecting = () => { setSelecting(false); setSelected(new Map()); };
  const selection = (task: TaskDto) => selecting ? { checked: selected.has(task.id), disabled: !selected.has(task.id) && selected.size >= 12, toggle: () => setSelected(current => { const next = new Map(current); if (next.has(task.id)) next.delete(task.id); else if (next.size < 12) next.set(task.id, task); return next; }) } : undefined;
  const projects = useProjects(userId);
  const list = useInfiniteQuery({
    queryKey: resourceKey('tasks', userId, { view, ...filters }), initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) => {
      const params = new URLSearchParams({ view, limit: '30' });
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      if (pageParam) params.set('cursor', pageParam);
      return apiRequest<CursorPage<TaskDto>>(`/tasks?${params}`, { signal });
    }, getNextPageParam: page => page.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap(page => page.items) ?? [];
  const filtered = Object.entries(filters).some(([key, value]) => key === 'archived' ? value === 'true' : key === 'type' ? value !== (initialType ?? '') : !!value);
  const page = view === 'all' ? 'tasks' : view, title = initialType ? t.types[initialType] : text.pageLabels[page];
  const change = (name: keyof Filters, value: string) => { if (name === 'type' && view === 'all') navigate(`/tasks${value ? `?type=${value}` : ''}`); else setFilters(current => ({ ...current, [name]: value })); };
  const select = (name: keyof Filters, label: string, options: Record<string, string>) => <label className="filter-control"><span className="sr-only">{label}</span><select aria-label={label} value={filters[name]} onChange={event => change(name, event.target.value)}><option value="">{label}</option>{Object.entries(options).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
  const today = dateIn(timezone), now = Date.now();
  const isOverdue = (task: TaskDto) => !['done', 'canceled'].includes(task.status) && !!task.due && (task.due.kind === 'date' ? task.due.date < today : Date.parse(task.due.at) < now);
  const isScheduled = (task: TaskDto) => task.scheduleBlocks.some(block => dateIn(timezone, Date.parse(block.startAt)) <= today && dateIn(timezone, Date.parse(block.endAt) - 1) >= today);
  const rows = (tasks: TaskDto[], label: string) => <ul className="task-list" aria-label={label}>{tasks.map(task => <TaskRow key={task.id} selection={selection(task)} task={task} userId={userId} timezone={timezone} projectName={projects.data?.find(project => project.id === task.projectId)?.name} onRefresh={() => void list.refetch()} />)}</ul>;
  const overdue = items.filter(isOverdue), done = items.filter(task => task.status === 'done'), active = items.filter(task => !isOverdue(task) && !['done', 'canceled'].includes(task.status));
  const scheduled = active.filter(isScheduled).sort((a, b) => (a.scheduleBlocks[0]?.startAt ?? '').localeCompare(b.scheduleBlocks[0]?.startAt ?? '')), unscheduled = active.filter(task => !isScheduled(task));
  const listHead = <div className="task-list-head"><span>时间</span><span>任务</span><span>类型</span><span /></div>;
  const openAI = (value = command) => window.dispatchEvent(new CustomEvent('research:plan-task', { detail: value }));
  const filterPanel = (
<div className={view === 'all' ? 'task-primary-filters' : 'task-secondary-filters'}>
      {view === 'all' && <div className="task-filters" role="search" aria-label={t.filterLabel}><label className="task-search"><span className="sr-only">{t.search}</span><input type="search" value={filters.q} maxLength={200} onChange={event => change('q', event.target.value)} placeholder="搜索任务、项目……" /></label>{select('type', t.allTypes, t.types)}{select('status', t.allStatuses, t.statuses)}{select('priority', t.allPriorities, t.priorities)}{select('due', t.allDue, { today: t.dueToday, overdue: t.overdue, none: t.noDue })}</div>}
      <details className="advanced-task-filters"><summary>{view === 'all' ? '更多筛选与课题' : '筛选与课题'}</summary><div className="task-filters">
        {view !== 'all' && <><label className="task-search"><span className="sr-only">{t.search}</span><input type="search" value={filters.q} maxLength={200} onChange={event => change('q', event.target.value)} placeholder={t.searchPlaceholder} /></label>{select('type', t.allTypes, t.types)}{select('priority', t.allPriorities, t.priorities)}</>}
        {select('projectId', t.allProjects, Object.fromEntries((projects.data ?? []).map(project => [project.id, project.name])))}<label className="filter-date"><span>{t.dueFrom}</span><input type="date" value={filters.dueFrom} onChange={event => change('dueFrom', event.target.value)} /></label><label className="filter-date"><span>{t.dueTo}</span><input type="date" value={filters.dueTo} onChange={event => change('dueTo', event.target.value)} /></label><select aria-label={t.showArchived} value={filters.archived} onChange={event => change('archived', event.target.value)}><option value="false">{t.activeTasks}</option><option value="true">{t.showArchived}</option></select><button type="button" onClick={() => setPanel('projects')}>{t.projectManage}</button>{filtered && <button type="button" onClick={() => setFilters(defaults)}>{t.clearFilters}</button>}
      </div></details>
    </div>
  );
  return <div className={`tasks-view view-${view}`}>
    <div className="page-heading task-page-heading"><div><p className="eyebrow">{view === 'today' ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(now).toUpperCase() : view === 'inbox' ? 'CAPTURE NOW, ORGANIZE LATER' : 'A LITTLE CLARITY, EVERY DAY'}</p><h1>{title}</h1><p className="page-description">{view === 'today' ? `${new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, month: 'long', day: 'numeric', weekday: 'long' }).format(now)} / 把注意力，留给重要的研究。` : view === 'inbox' ? '先捕捉想法，稍后再整理。' : '为每一项研究工作，找到合适的位置。'}</p></div><div className="task-heading-actions">{view === 'inbox' ? <span className="pill">{items.length}{list.hasNextPage ? '+' : ''} 项待整理</span> : view === 'all' ? <button type="button" className="primary add-task" onClick={() => setPanel('create')}><Icon name="plus" />手动添加</button> : null}</div></div>
    {view === 'today' && <><form className="today-command" onSubmit={event => { event.preventDefault(); openAI(); }}><Icon name="spark" /><input id="today-task-input" aria-label="告诉我你接下来要完成什么" maxLength={2000} placeholder="告诉我你接下来要完成什么……" value={command} onChange={event => setCommand(event.target.value)} /><kbd>⌘ K</kbd><button type="submit" aria-label="AI 安排任务" disabled={!command.trim()}><Icon name="arrow" /></button></form><div className="command-hints"><span>让繁杂的计划，变得简单</span><span className="divider" /><button type="button" onClick={() => { if (command.trim()) openAI(); else document.getElementById('today-task-input')?.focus(); }}>✧ 帮我安排任务</button></div></>}
    {view !== 'today' && <AiEntry placeholder={view === 'inbox' ? '记录想法，让 AI 帮你拆解和整理……' : '描述研究目标，让 AI 创建、整理或调整任务……'} />}
    {view !== 'today' && (selecting ? <Suspense fallback={<p role="status">正在加载批量管理…</p>}><BatchActions selected={[...selected.values()]} userId={userId} timezone={timezone} onClose={stopSelecting} /></Suspense> : <button type="button" className="batch-mode-button" onClick={() => setSelecting(true)}>批量管理</button>)}
    {view === 'inbox' && <details><summary>手动记录</summary><TaskQuickCreate userId={userId} inbox /></details>}
    {view === 'all' && <div className="task-view-toolbar"><span>所有研究事项</span><div className="view-switch"><button type="button" aria-label="列表视图" aria-pressed={!board} onClick={() => setBoard(false)}><Icon name="tasks" /></button><button type="button" aria-label="看板视图" aria-pressed={board} onClick={() => setBoard(true)}><Icon name="grid" /></button></div></div>}
    {view !== 'today' && filterPanel}
    {view === 'inbox' && <div className="inbox-caption">未安排的想法与待办</div>}
    {projects.isError && <p className="error" role="alert">{t.projectUnavailable} <button type="button" onClick={() => void projects.refetch()}>{t.retry}</button></p>}
    {list.isPending ? <p role="status" className="list-status">{t.loading}</p> : list.isError && !list.data ? <div className="list-status" role="alert"><p className="error">{t.loadFailed}：{list.error.message}</p><button type="button" onClick={() => void list.refetch()}>{t.retry}</button></div> : view === 'today' ? <>
      {overdue.length > 0 && <details className="task-group overdue-group"><summary>有 {overdue.length} 项任务已逾期</summary>{rows(overdue, t.overdueGroup)}</details>}
      <div className="task-section-heading"><h2>今日安排 <small>{scheduled.length}</small></h2><span>{done.length} 项已完成 · 按时间排列</span></div>{listHead}{scheduled.length ? rows(scheduled, '今日安排') : <EmptyState icon="calendar" title="今天还没有安排" description="在上方输入想做的事情，让 AI 帮你安排。" />}
      <div className="task-section-heading"><h2>未安排 <small>{unscheduled.length}</small></h2><span>有时间时，再往前一步</span></div>{unscheduled.length ? rows(unscheduled, '未安排') : <p className="help">今天没有未安排的待办。</p>}{done.length > 0 && <details className="task-group"><summary>已完成 {done.length} 项</summary>{rows(done, t.completedGroup)}</details>}
      <div className="task-section-heading"><h2>接下来</h2><Link href="/calendar">查看日历 →</Link></div><p className="help">完整日程与投稿期限可在日历查看。</p>
    </> : items.length === 0 ? <EmptyState icon={page} title={filtered ? t.filteredEmpty : view === 'inbox' ? '收集箱已清空' : t.allEmpty} description={filtered ? t.filteredEmptyHelp : view === 'inbox' ? '随时记录新想法，不需要马上填写日期。' : t.allEmptyHelp} /> : view === 'all' && board ? <div className="task-board">{(['inbox', 'todo', 'in_progress', 'done', 'canceled'] as const).filter(status => ['todo', 'in_progress', 'done'].includes(status) || items.some(item => item.status === status)).map(status => <div className="task-board-column" key={status}><h2>{t.statuses[status]} <small>{items.filter(item => item.status === status).length}</small></h2>{items.filter(item => item.status === status).map(task => <div className="task-board-card-shell" key={task.id}>{selecting && <label><input type="checkbox" aria-label={`选择任务：${task.title}`} checked={selected.has(task.id)} disabled={!selected.has(task.id) && selected.size >= 12} onChange={() => selection(task)?.toggle()} />选择</label>}<Link className="task-board-card" href={`/tasks/${task.id}`}>{task.title}<small>{t.types[task.type]}</small></Link></div>)}</div>)}</div> : <>{view === 'all' && listHead}{rows(items, title)}</>}
    {view === 'inbox' && <p className="prototype-notice">ⓘ 未提供日期的任务会保持未安排，整理时也不会自动添加截止日期。</p>}
    {list.isError && list.data && <p className="error" role="alert">{list.error.message}<button type="button" onClick={() => void list.refetch()}>{t.retry}</button></p>}{list.hasNextPage && <div className="load-more"><button type="button" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? t.loadingMore : t.loadMore}</button></div>}
    {view === 'today' && filterPanel}
    {panel === 'create' && <Dialog title={t.createTitle} onClose={() => setPanel(null)}><TaskEditor userId={userId} timezone={timezone} onSaved={() => setPanel(null)} /></Dialog>}{panel === 'projects' && <ProjectManager userId={userId} onClose={() => setPanel(null)} />}
  </div>;
}
