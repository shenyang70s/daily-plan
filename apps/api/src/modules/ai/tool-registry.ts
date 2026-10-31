import type { AiDecision, AiInterpretResult, CalendarItem } from '@research/contracts';
import { calendarWindow, shiftCalendarDate, formatDeadline } from '@research/domain';
import type { SessionContext } from '../identity/identity.service.js';
import type { TasksService } from '../tasks/tasks.service.js';
import type { CalendarService } from '../calendar/calendar.service.js';
import type { SubmissionsService } from '../submissions/submissions.service.js';
import { AppError } from '../../common/app-error.js';
export class ReadTools {
  constructor(private readonly tasks: TasksService, private readonly calendar: CalendarService, private readonly submissions: SubmissionsService) {}
  query(ctx: SessionContext, decision: AiDecision, timezone: string, now: number): AiInterpretResult {
    const base = { kind: 'query' as const, asOf: new Date(now).toISOString() };
    if (decision.kind === 'query') {
      const result = this.tasks.list(ctx, { ...decision.params, limit: Math.min(decision.params.limit, 30) });
      const states: Record<string, string> = { inbox: '收集箱', todo: '待办', in_progress: '进行中', done: '已完成', canceled: '已取消' };
      return { ...base, resource: 'tasks', truncated: !!result.nextCursor, items: result.items.map(item => ({ id: item.id, title: item.title, detail: `${states[item.status]}${item.due ? ` · ${formatDeadline(item.due, timezone)}` : ' · 未设置期限'}`, href: `/tasks/${item.id}` })) };
    }
    if (decision.kind === 'submission_query') {
      const result = this.submissions.list(ctx, { ...decision.params, limit: Math.min(decision.params.limit, 30) });
      return { ...base, resource: 'submissions', truncated: !!result.nextCursor, items: result.items.map(item => ({ id: item.id, title: item.name, detail: `${item.year ?? ''} ${item.round ?? ''}${item.nextMilestone?.due ? ` · ${formatDeadline(item.nextMilestone.due, timezone)}` : ' · 无已知后续期限'}`.trim(), href: `/submissions/${item.id}` })) };
    }
    if (decision.kind === 'calendar_query') {
      const { fromDate, throughDate } = decision.params;
      if (throughDate < fromDate || throughDate > shiftCalendarDate(fromDate, 30)) throw new AppError(422, 'AI_QUERY_RANGE', '日历查询请指定不超过 31 天的明确日期范围');
      const from = calendarWindow(fromDate, 'day', timezone).from, to = calendarWindow(throughDate, 'day', timezone).to;
      const result = this.calendar.list(ctx, { from, to, timezone });
      const items = result.items.filter((item): item is CalendarItem => 'kind' in item);
      return { ...base, resource: 'calendar', truncated: items.length > 30, items: items.slice(0, 30).map(item => ({ id: `${item.kind}:${item.resourceId}`, title: item.title, detail: item.date ?? (item.startAt ? formatDeadline({ kind: 'instant', at: item.startAt, timezone: item.timezone }, timezone) : ''), href: item.kind === 'milestone' ? `/submissions/${item.submissionId}` : `/calendar/${item.kind === 'event' ? 'events' : 'blocks'}/${item.resourceId}` })) };
    }
    throw new AppError(502, 'AI_INVALID_OUTPUT', '模型请求了不支持的查询工具');
  }
}
