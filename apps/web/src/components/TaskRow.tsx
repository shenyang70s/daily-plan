import type { TaskDto } from '@research/contracts';
import { Link } from '../app/router';
import { tasksText as t } from '../locales/zh-CN';
import { TaskActions } from '../features/tasks/TaskActions';
export function dueLabel(task: TaskDto, timezone: string): string {
  if (!task.due) return t.noDue;
  return task.due.kind === 'date' ? task.due.date : new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(task.due.at));
}
export function TaskRow({ task, userId, timezone, projectName, onRefresh }: { task: TaskDto; userId: string; timezone: string; projectName?: string | undefined; onRefresh: () => void }) {
  return <li className={`task-row${task.status === 'done' ? ' task-done' : ''}`}>
    <div className="task-row-content"><Link className="task-row-title" href={`/tasks/${task.id}`}>{task.title}</Link><div className="task-row-meta"><span>{t.types[task.type]}</span><span>{t.statuses[task.status]}</span>{projectName && <span>{projectName}</span>}<span className={`priority-${task.priority}`}>{t.priorities[task.priority]}</span></div></div>
    <span className="task-due" title={task.due?.kind === 'instant' ? `${task.due.at} · ${task.due.timezone}` : ''}>{dueLabel(task, timezone)}</span>
    <TaskActions task={task} userId={userId} compact onRefresh={onRefresh} />
  </li>;
}
