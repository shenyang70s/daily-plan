import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { calendarDateAt, calendarWindow, shiftCalendarDate } from '@research/domain';
import type { CalendarItem, CalendarEventDto, CalendarBlockDto } from '@research/contracts';
import { ApiError, apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';
import { text, calendarText as t } from '../../locales/zh-CN';
import { navigate } from '../../app/router';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { CalendarGrid } from './CalendarGrid';
import { CalendarForm } from './CalendarForm';
import { EventDetailPanel } from './EventDetailPanel';
interface Props { userId: string; timezone: string; selection?: { kind: 'event' | 'block'; id: string } | undefined }
export function CalendarPage({ userId, timezone, selection }: Props) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week'), [date, setDate] = useState(() => calendarDateAt(new Date().toISOString(), timezone)), [slot, setSlot] = useState<string | null>(null), [revision, setRevision] = useState(0);
  const window = useMemo(() => calendarWindow(date, view, timezone), [date, view, timezone]);
  const calendar = useQuery({ queryKey: resourceKey('calendar', userId, { from: window.from, to: window.to, timezone }), queryFn: ({ signal }) => apiRequest<{ items: CalendarItem[] }>(`/calendar?${new URLSearchParams({ from: window.from, to: window.to, timezone })}`, { signal }) });
  const selected = useQuery({ queryKey: resourceKey(selection?.kind === 'block' ? 'calendarBlock' : 'calendarEvent', userId, { id: selection?.id }), enabled: !!selection, queryFn: ({ signal }) => apiRequest<CalendarEventDto | CalendarBlockDto>(selection?.kind === 'event' ? `/calendar/events/${encodeURIComponent(selection.id)}` : `/schedule-blocks/${encodeURIComponent(selection!.id)}`, { signal }) });
  const close = () => { setSlot(null); if (selection) navigate('/calendar'); };
  const refresh = async () => { const result = await selected.refetch(); if (result.isSuccess) setRevision(value => value + 1); };
  const move = (amount: number) => setDate(current => shiftCalendarDate(current, amount * (view === 'week' ? 7 : 1), view === 'month' ? 'months' : 'days'));
  return <>
    <div className="page-heading"><p className="eyebrow">{text.eyebrow}</p><h1>{t.title}</h1><p className="page-description">{t.slotHelp}</p></div>
    <div className="calendar-toolbar"><div className="calendar-date-navigation"><button type="button" aria-label={t.previous} onClick={() => move(-1)}>←</button><button type="button" onClick={() => setDate(calendarDateAt(new Date().toISOString(), timezone))}>{t.today}</button><button type="button" aria-label={t.next} onClick={() => move(1)}>→</button><label><span className="sr-only">{t.chooseDate}</span><input type="date" value={date} required onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label></div><div className="calendar-view-buttons" aria-label={t.title}>{(['day', 'week', 'month'] as const).map(value => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{t[value]}</button>)}</div></div>
    <p className="calendar-zone">{t.timezone}：{timezone}</p>
    {calendar.isPending ? <p role="status">{t.loading}</p> : calendar.isError && !calendar.data ? <div role="alert"><p className="error">{t.failed}：{calendar.error.message}</p><button type="button" onClick={() => void calendar.refetch()}>{t.retry}</button></div> : <>
      {calendar.isError && <p className="error" role="alert">{calendar.error.message}<button type="button" onClick={() => void calendar.refetch()}>{t.retry}</button></p>}
      <CalendarGrid dates={window.dates} items={calendar.data?.items ?? []} timezone={timezone} view={view} onSlot={value => setSlot(value)} />
      {!calendar.data?.items.length && <p className="help calendar-empty">{t.noItems}</p>}
      <div className="calendar-legend"><span className="legend-block">{t.block}</span><span className="legend-event">{t.event}</span><span className="legend-milestone">{t.milestone}</span></div>
    </>}
    {slot && !selection && <Dialog title={t.newSchedule} onClose={close}><CalendarForm userId={userId} timezone={timezone} slot={slot} onSaved={close} /></Dialog>}
    {selection && <Dialog key={`${selection.kind}:${selection.id}`} title={selection.kind === 'event' ? t.editEvent : t.editBlock} onClose={close}>{selected.isPending ? <p role="status">{t.loading}</p> : selected.isError ? selected.error instanceof ApiError && selected.error.status === 404 ? <EmptyState title={t.notFound} description={t.notFoundHelp} /> : <p className="error" role="alert">{selected.error.message}<button type="button" onClick={() => void refresh()}>{t.retry}</button></p> : selected.data && <EventDetailPanel key={`${selection.id}:${revision}`} initial={selection.kind === 'event' ? { kind: 'event', value: selected.data as CalendarEventDto } : { kind: 'block', value: selected.data as CalendarBlockDto }} userId={userId} timezone={timezone} onSaved={close} onRefresh={() => void refresh()} />}</Dialog>}
  </>;
}
