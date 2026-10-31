import type { TaskDto } from '@research/contracts';
import { Link } from '../app/router';
import { tasksText as t } from '../locales/zh-CN';
import { TaskActions } from '../features/tasks/TaskActions';
import { Icon } from './Icon';
export function dueLabel(task: TaskDto, timezone: string): string {
  if (!task.due) return t.noDue;
  return task.due.kind === 'date' ? task.due.date : new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(task.due.at));
}
export function TaskRow({ task, userId, timezone, projectName, onRefresh, selection }: { task: TaskDto; userId: string; timezone: string; projectName?: string | undefined; onRefresh: () => void; selection?: { checked: boolean; disabled: boolean; toggle: () => void } | undefined }) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }), today = day.format(new Date());
  const block = task.scheduleBlocks.find(item => day.format(new Date(item.startAt)) === today) ?? task.scheduleBlocks[0];
  const time = (at: string) => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
  return <li className={`task-row${task.status === 'done' ? ' task-done' : ''}${task.status === 'in_progress' ? ' in-progress' : ''}`}>
    {selection && <input className="batch-task-check" type="checkbox" aria-label={`选择任务：${task.title}`} checked={selection.checked} disabled={selection.disabled} onChange={selection.toggle} />}
    <div className="task-time" title={block ? `${block.startAt} — ${block.endAt} · ${timezone}` : '未安排工作块'}>{block ? <>{time(block.startAt)}<small>{time(block.endAt)}</small></> : '—'}</div>
    <TaskActions task={task} userId={userId} compact checkbox onRefresh={onRefresh} />
    <div className="task-row-content"><Link className="task-row-title" href={`/tasks/${task.id}`}>{task.title}</Link><div className="task-row-meta">{projectName && <span><Icon name="folder" />{projectName}</span>}{task.durationMinutes != null && <span>{task.durationMinutes} 分钟</span>}{task.priority === 'high' && <span className="priority-high">高优先级</span>}{task.due && <span className="task-due" title={task.due.kind === 'instant' ? `${task.due.at} · ${task.due.timezone}` : ''}>期限 {dueLabel(task, timezone)}</span>}{!projectName && task.durationMinutes == null && !task.due && <span>{task.status === 'inbox' ? '等待整理' : '未设置期限'}</span>}</div></div>
    <span className="task-row-type"><Icon name={task.type} />{t.types[task.type]}</span><span className="task-row-state">{task.status === 'in_progress' ? <span className="pill blue">进行中</span> : task.status === 'done' ? <Icon name="check" /> : task.status === 'canceled' ? '已取消' : null}</span>
  </li>;
}
