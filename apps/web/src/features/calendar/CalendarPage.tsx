import { CalendarMoveDialog } from './CalendarMoveDialog';
import { draggedBlockRange } from './drag-time';
import { AiEntry } from '../ai/AiEntry';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { calendarDateAt, calendarWindow, shiftCalendarDate } from '@research/domain';
import type { CalendarItem, CalendarEventDto, CalendarBlockDto, CalendarRange } from '@research/contracts';
import { ApiError, apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { text, calendarText as t } from '../../locales/zh-CN';
import { navigate } from '../../app/router';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { CalendarGrid } from './CalendarGrid';
import { openAi } from '../ai/entry';
import { EventDetailPanel } from './EventDetailPanel';
interface Props { userId: string; timezone: string; initialDate?: string | undefined; selection?: { kind: 'event' | 'block'; id: string } | undefined }
export function CalendarPage({ userId, timezone, selection, initialDate }: Props) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week'), [date, setDate] = useState(() => initialDate ?? calendarDateAt(new Date().toISOString(), timezone)), [revision, setRevision] = useState(0);
  const [drag, setDrag] = useState<{ item: CalendarItem; range: CalendarRange } | null>(null), [dragError, setDragError] = useState('');
  const window = useMemo(() => calendarWindow(date, view, timezone), [date, view, timezone]);
  const calendar = useQuery({ queryKey: resourceKey('calendar', userId, { from: window.from, to: window.to, timezone }), queryFn: ({ signal }) => apiRequest<{ items: CalendarItem[] }>(`/calendar?${new URLSearchParams({ from: window.from, to: window.to, timezone })}`, { signal }) });
  const selected = useQuery({ queryKey: resourceKey(selection?.kind === 'block' ? 'calendarBlock' : 'calendarEvent', userId, { id: selection?.id }), enabled: !!selection, queryFn: ({ signal }) => apiRequest<CalendarEventDto | CalendarBlockDto>(selection?.kind === 'event' ? `/calendar/events/${encodeURIComponent(selection.id)}` : `/schedule-blocks/${encodeURIComponent(selection!.id)}`, { signal }) });
  const close = () => { if (selection) navigate('/calendar'); };
  const refresh = async () => { const result = await selected.refetch(); if (result.isSuccess) setRevision(value => value + 1); };
  const move = (amount: number) => setDate(current => shiftCalendarDate(current, amount * (view === 'week' ? 7 : 1), view === 'month' ? 'months' : 'days'));
  return <div className="calendar-page">
    <div className="page-heading"><h1>{t.title}</h1></div>
    <AiEntry placeholder="描述日程或调整要求，例如：把论文阅读改到明天14点……" />
    <div className="calendar-toolbar"><div className="calendar-date-navigation"><button type="button" aria-label={t.previous} onClick={() => move(-1)}>←</button><button type="button" onClick={() => setDate(calendarDateAt(new Date().toISOString(), timezone))}>{t.today}</button><button type="button" aria-label={t.next} onClick={() => move(1)}>→</button><label><span className="sr-only">{t.chooseDate}</span><input type="date" value={date} required onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label></div><div className="calendar-view-controls"><span className="calendar-zone" title={`${t.timezone}：${timezone}`} aria-label={`${t.timezone}：${timezone}`}>{timezone}</span><details className="calendar-help"><summary>操作提示</summary><p className="help">日/周视图可拖动工作块，按15分钟选择目标时间并预览确认。固定事件和截止节点保持原样；键盘或手机可点击工作块进入详情调整。</p></details><div className="calendar-view-buttons" aria-label={t.title}>{(['day', 'week', 'month'] as const).map(value => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{t[value]}</button>)}</div></div></div>
    {dragError && <p className="error" role="alert">{dragError}</p>}
    {calendar.isPending ? <p role="status">{t.loading}</p> : calendar.isError && !calendar.data ? <div role="alert"><p className="error">{t.failed}：{calendar.error.message}</p><button type="button" onClick={() => void calendar.refetch()}>{t.retry}</button></div> : <>
      {calendar.isError && <p className="error" role="alert">{calendar.error.message}<button type="button" onClick={() => void calendar.refetch()}>{t.retry}</button></p>}
      <CalendarGrid dates={window.dates} items={calendar.data?.items ?? []} timezone={timezone} view={view} onMove={(item, localStart) => { try { setDragError(''); setDrag({ item, range: draggedBlockRange(item, localStart, timezone) }); } catch { setDragError('无法推断这个本地时刻，请在详情中明确时间或夏令时偏移。'); } }} onSlot={value => openAi(`在 ${value.replace('T', ' ')}（${timezone}）开始，安排：`, undefined, false)} />
      {!calendar.data?.items.length && <p className="help calendar-empty">{t.noItems}</p>}
      <div className="calendar-legend"><span className="legend-block">{t.block}</span><span className="legend-event">{t.event}</span><span className="legend-milestone">{t.milestone}</span></div>
    </>}
    {drag && <CalendarMoveDialog key={`${drag.item.resourceId}:${drag.range.startAt}`} userId={userId} item={drag.item} range={drag.range} onClose={() => setDrag(null)} />}
    {selection && <Dialog key={`${selection.kind}:${selection.id}`} title={selection.kind === 'event' ? t.editEvent : t.editBlock} onClose={close}>{selected.isPending ? <p role="status">{t.loading}</p> : selected.isError ? selected.error instanceof ApiError && selected.error.status === 404 ? <EmptyState title={t.notFound} description={t.notFoundHelp} /> : <p className="error" role="alert">{selected.error.message}<button type="button" onClick={() => void refresh()}>{t.retry}</button></p> : selected.data && <EventDetailPanel key={`${selection.id}:${revision}`} initial={selection.kind === 'event' ? { kind: 'event', value: selected.data as CalendarEventDto } : { kind: 'block', value: selected.data as CalendarBlockDto }} userId={userId} timezone={timezone} onSaved={close} onRefresh={() => void refresh()} />}</Dialog>}
  </div>;
}
