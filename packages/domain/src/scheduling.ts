import { calendarDateAt, calendarWindow, normalizeDeadline, shiftCalendarDate } from './calendar-time.js';
type CalendarRange = { startAt: string; endAt: string; timezone: string };
type TaskDue = { kind: 'date'; date: string } | { kind: 'instant'; at: string; timezone: string } | null;
type CalendarItem = { kind: string; startAt?: string; endAt?: string };
export function suggestSchedule(input: { now: number; timezone: string; workStart: string; workEnd: string; durationMinutes: number; preferredDate?: string; due: TaskDue; items: Pick<CalendarItem, 'kind' | 'startAt' | 'endAt'>[] }): CalendarRange | null {
  const today = input.preferredDate ?? calendarDateAt(new Date(input.now).toISOString(), input.timezone), duration = Math.max(1, input.durationMinutes) * 60000;
  const latest = input.due?.kind === 'instant' ? Date.parse(input.due.at) : input.due?.kind === 'date' ? Date.parse(calendarWindow(input.due.date, 'day', input.timezone).to) : Infinity;
  const busy = input.items.filter(item => ['event', 'block'].includes(item.kind) && item.startAt && item.endAt).map(item => ({ start: Date.parse(item.startAt!), end: Date.parse(item.endAt!) })).sort((a, b) => a.start - b.start);
  for (let offset = 0; offset < (input.preferredDate ? 1 : 7); offset++) {
    const date = shiftCalendarDate(today, offset);
    let from: number, to: number;
    try { from = Date.parse(normalizeDeadline({ localDateTime: `${date}T${input.workStart}`, timezone: input.timezone }).at); to = Math.min(latest, Date.parse(normalizeDeadline({ localDateTime: `${date}T${input.workEnd}`, timezone: input.timezone }).at)); }
    catch { continue; }
    let start = Math.max(from, Math.ceil((input.now + 60000) / 900000) * 900000);
    for (const period of busy) {
      if (period.end <= start || period.start >= to) continue;
      if (start + duration <= period.start) break;
      start = Math.ceil(period.end / 900000) * 900000;
    }
    if (start + duration <= to) return { startAt: new Date(start).toISOString(), endAt: new Date(start + duration).toISOString(), timezone: input.timezone };
  }
  return null;
}

export function planTaskSchedules(input: { now: number; timezone: string; workStart: string; workEnd: string; fromDate: string; throughDate: string; items: CalendarItem[]; tasks: { id: string; priority: 'high' | 'normal' | 'low'; due: TaskDue; durationMinutes: number | null }[] }) {
  const priorities = { high: 0, normal: 1, low: 2 }, deadline = (due: TaskDue) => !due ? Infinity : due.kind === 'date' ? Date.parse(calendarWindow(due.date, 'day', input.timezone).to) : Date.parse(due.at);
  const tasks = [...input.tasks].sort((a, b) => priorities[a.priority] - priorities[b.priority] || deadline(a.due) - deadline(b.due) || a.id.localeCompare(b.id));
  const busy = [...input.items], scheduled: { taskId: string; range: CalendarRange }[] = [], unplanned: { taskId: string; reason: string }[] = [];
  for (const task of tasks) {
    let range: CalendarRange | null = null;
    for (let day = input.fromDate, index = 0; day <= input.throughDate && index < 7; day = shiftCalendarDate(day, 1), index++) {
      range = suggestSchedule({ ...input, durationMinutes: task.durationMinutes && task.durationMinutes > 0 ? task.durationMinutes : 30, due: task.due, preferredDate: day, items: busy });
      if (range) break;
    }
    if (range) { scheduled.push({ taskId: task.id, range }); busy.push({ kind: 'block', ...range }); }
    else unplanned.push({ taskId: task.id, reason: '所选日期工作时间内没有满足预计时长与截止期限的空档' });
  }
  return { scheduled, unplanned };
}
