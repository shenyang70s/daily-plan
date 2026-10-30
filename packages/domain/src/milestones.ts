import type { TaskDue } from './task-state.js';
import { calendarDateAt, calendarWindow, localDateTimeAt, calendarOffsetAt } from './calendar-time.js';

export function formatDeadline(due: TaskDue, timezone: string): string {
  if (!due) return '';
  if (due.kind === 'date') return due.date;
  return `${localDateTimeAt(due.at, timezone).replace('T', ' ')} ${calendarOffsetAt(due.at, timezone)} · ${timezone}`;
}
export function deadlineCountdown(due: TaskDue, now: number, timezone: string): { state: 'unknown' | 'upcoming' | 'passed'; days: number | null; seconds: number | null } {
  if (!due) return { state: 'unknown', days: null, seconds: null };
  if (due.kind === 'date') {
    const today = calendarDateAt(new Date(now).toISOString(), timezone);
    // Date arithmetic only: the subtraction counts calendar days, not deadline instants.
    const days = Math.round((Date.parse(`${due.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    return { state: days < 0 ? 'passed' : 'upcoming', days, seconds: null };
  }
  const remaining = Date.parse(due.at) - now;
  return { state: remaining <= 0 ? 'passed' : 'upcoming', days: null, seconds: Math.max(0, Math.ceil(remaining / 1000)) };
}
export function nextMilestone<T extends { due: TaskDue }>(milestones: readonly T[], now: number, timezone: string): T | null {
  const candidates = milestones.flatMap(milestone => {
    if (!milestone.due) return [];
    const at = milestone.due.kind === 'date' ? Date.parse(calendarWindow(milestone.due.date, 'day', timezone).to) - 1 : Date.parse(milestone.due.at);
    return at >= now ? [{ milestone, at }] : [];
  });
  candidates.sort((a, b) => a.at - b.at);
  return candidates[0]?.milestone ?? null;
}
