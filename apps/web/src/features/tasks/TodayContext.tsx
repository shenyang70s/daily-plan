import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CalendarItem } from '@research/contracts';
import { calendarDateAt, calendarWindow, shiftCalendarDate, formatDeadline } from '@research/domain';
import { apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { Link, navigate } from '../../app/router';
import { Icon } from '../../components/Icon';
export function TodayContext({ userId, timezone, onNotifications }: { userId: string; timezone: string; onNotifications: () => void }) {
  const today = calendarDateAt(new Date().toISOString(), timezone), [month, setMonth] = useState(today.slice(0, 7) + '-01');
  const range = calendarWindow(month, 'month', timezone);
  const calendar = useQuery({ queryKey: resourceKey('calendar', userId, { from: range.from, to: range.to, timezone }), queryFn: ({ signal }) => apiRequest<{ items: CalendarItem[] }>(`/calendar?${new URLSearchParams({ from: range.from, to: range.to, timezone })}`, { signal }) });
  const future = useQuery({ queryKey: resourceKey('calendar', userId, { context: true, today, timezone }), queryFn: ({ signal }) => {
    const from = calendarWindow(today, 'day', timezone).from, to = calendarWindow(shiftCalendarDate(today, 30), 'day', timezone).to;
    return apiRequest<{ items: CalendarItem[] }>(`/calendar?${new URLSearchParams({ from, to, timezone })}`, { signal });
  } });
  const next = (future.data?.items ?? []).filter(item => (item.kind === 'event' || !!item.submissionId) && (item.date ? item.date >= today : !!item.startAt && Date.parse(item.endAt ?? item.startAt) >= Date.now())).sort((a, b) => (a.date ?? a.startAt ?? '').localeCompare(b.date ?? b.startAt ?? '')).slice(0, 3);
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate(), offset = range.dates.indexOf(month), dates = range.dates.slice(0, Math.ceil((offset + daysInMonth) / 7) * 7);
  return <aside className="shell-context" aria-label="日历和近期安排">
    <div className="mini-calendar-heading"><strong>{Number(month.slice(0, 4))} 年 {Number(month.slice(5, 7))} 月</strong><div><button type="button" aria-label="上个月" onClick={() => setMonth(shiftCalendarDate(month, -1, 'months'))}>‹</button><button type="button" aria-label="下个月" onClick={() => setMonth(shiftCalendarDate(month, 1, 'months'))}>›</button></div></div>
    <div className="mini-calendar">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span className="mini-weekday" key={day}>{day}</span>)}{dates.map(date => <button type="button" key={date} aria-label={`查看 ${date} 的日历`} aria-current={date === today ? 'date' : undefined} className={`${date.slice(0, 7) !== month.slice(0, 7) ? 'outside' : ''} ${(calendar.data?.items ?? []).some(item => (item.kind === 'event' || item.kind === 'block') && item.startAt && calendarDateAt(item.startAt, timezone) === date) ? 'has-event' : ''}`} onClick={() => navigate(`/calendar?date=${date}`)}>{Number(date.slice(8))}</button>)}</div>
    <p className="mini-legend"><i />有日程安排</p>
    <div className="context-heading"><h2>近期安排</h2><button type="button" className="icon-button" aria-label="查看通知中心" onClick={onNotifications}>···</button></div>
    {future.isPending ? <p className="help">正在读取日程…</p> : future.isError ? <p className="error" role="alert">{future.error.message}</p> : next.length === 0 ? <p className="help">暂无近期安排</p> : next.map(item => <Link className="context-reminder" key={`${item.kind}:${item.resourceId}`} href={item.kind === 'milestone' ? `/submissions/${item.submissionId}` : `/calendar/${item.kind === 'event' ? 'events' : 'blocks'}/${item.resourceId}`}><Icon name={item.kind === 'milestone' ? 'submissions' : 'calendar'} /><span><strong>{item.title}</strong><small>{item.date ?? (item.startAt ? formatDeadline({ kind: 'instant', at: item.startAt, timezone: item.timezone }, timezone) : '')}</small></span></Link>)}
    <button type="button" className="context-all" onClick={onNotifications}>查看所有提醒 <Icon name="arrow" /></button>
    <p className="context-footer">所有安排由你决定。<br />AI 的每一次更改，都会先请你确认。</p>
  </aside>;
}
