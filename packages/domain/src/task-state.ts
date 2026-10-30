export type TaskStatus = 'inbox' | 'todo' | 'in_progress' | 'done' | 'canceled';
export type TaskDue = { kind: 'date'; date: string } | { kind: 'instant'; at: string; timezone: string } | null;

const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  inbox: ['todo', 'canceled'],
  todo: ['inbox', 'in_progress', 'done', 'canceled'],
  in_progress: ['todo', 'done', 'canceled'],
  done: ['todo'],
  canceled: ['todo'],
};

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (from !== to && !transitions[from]?.includes(to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
}

export function isOverdue(
  task: { status: TaskStatus; due: TaskDue },
  clock: { today: string; now: number },
): boolean {
  if (task.status === 'done' || task.status === 'canceled' || !task.due) return false;
  return task.due.kind === 'date'
    ? task.due.date < clock.today
    : Date.parse(task.due.at) < clock.now;
}
