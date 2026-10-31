import { useEffect, useRef } from 'react';
import { calendarDateAt, localDateTimeAt, formatDeadline } from '@research/domain';
import type { CalendarItem } from '@research/contracts';
import { calendarText as t, submissionText } from '../../locales/zh-CN';
import { navigate } from '../../app/router';
const kindLabel = (item: CalendarItem) => item.kind === 'event' ? t.event : item.kind === 'block' ? t.block : t.milestone;
function onDate(item: CalendarItem, date: string, timezone: string): boolean {
  if (item.date) return item.date === date;
  if (!item.startAt) return false;
  const first = calendarDateAt(item.startAt, timezone), last = item.endAt ? calendarDateAt(new Date(Date.parse(item.endAt) - 1).toISOString(), timezone) : first;
  return first <= date && last >= date;
}
function Item({ item, timezone, placement, onDrag }: { item: CalendarItem; timezone: string; placement?: { top: number; height: number }; onDrag?: ((event: React.DragEvent<HTMLButtonElement>) => void) | undefined }) {
  const time = item.startAt ? `${localDateTimeAt(item.startAt, timezone).slice(11, item.kind === 'milestone' ? 19 : 16)}${item.endAt ? `–${localDateTimeAt(item.endAt, timezone).slice(11, 16)}` : ''}` : t.allDay;
  const title = item.milestoneKind ? `${item.title} · ${submissionText.kinds[item.milestoneKind]}` : item.title;
  const due = item.date ? { kind: 'date' as const, date: item.date } : item.startAt ? { kind: 'instant' as const, at: item.startAt, timezone: item.timezone } : null;
  const exact = item.kind === 'milestone' ? formatDeadline(due, timezone) : time;
  const source = item.kind === 'milestone' && due?.kind === 'instant' ? formatDeadline(due, item.sourceTimezone ?? item.timezone) : '';
  return <button type="button" draggable={item.kind === 'block' && !!onDrag} onDragStart={onDrag} className={`calendar-item item-${item.kind}`} style={placement} title={`${title} · ${exact}${source ? ` | ${source}` : ''}`} aria-label={`${kindLabel(item)}：${title} ${time}`} onClick={() => navigate(item.kind === 'milestone' ? item.submissionId ? `/submissions/${item.submissionId}` : `/tasks/${item.resourceId}` : `/calendar/${item.kind === 'event' ? 'events' : 'blocks'}/${item.resourceId}`)}><span>{time}</span><strong>{title}</strong></button>;
}
export function CalendarGrid({ dates, items, timezone, view, onSlot, onMove }: { dates: string[]; items: CalendarItem[]; timezone: string; view: 'day' | 'week' | 'month'; onSlot: (slot: string) => void; onMove?: (item: CalendarItem, localStart: string) => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroll.current && view !== 'month') scroll.current.scrollTop = 8 * 64; }, [view, dates[0]]);
  const today = calendarDateAt(new Date().toISOString(), timezone);
  if (view === 'month') return <div className="calendar-month-scroll"><div className="calendar-month-grid" role="group" aria-label={t.month}>{t.weekDays.map(day => <div className="month-weekday" key={day}>{day}</div>)}{dates.map(date => <div key={date} className="calendar-month-cell"><button type="button" className="month-date" aria-label={`${date} 09:00 ${t.createSlot}`} onClick={() => onSlot(`${date}T09:00:00`)}>{date.slice(5).replace('-', '/')}</button><div>{items.filter(item => onDate(item, date, timezone)).map(item => <Item key={`${item.kind}:${item.resourceId}`} item={item} timezone={timezone} />)}</div></div>)}</div></div>;
  return <div className="calendar-scroll" ref={scroll}><div className="calendar-time-grid" style={{ gridTemplateColumns: `56px repeat(${dates.length}, minmax(100px, 1fr))` }} role="group" aria-label={view === 'day' ? t.day : t.week}>
    <div className="calendar-corner" title={timezone}>时间</div>{dates.map((date, index) => <div className={`calendar-day-header${date === today ? ' is-today' : ''}`} key={date} title={date}><span>{view === 'week' ? t.weekDays[index] : '当日'}</span><strong>{Number(date.slice(8))}</strong></div>)}
    <div className="calendar-hour-label calendar-all-day-label">{t.allDay}</div>{dates.map(date => <div className="calendar-allday" key={date}>{items.filter(item => item.date === date).map(item => <Item key={`${item.kind}:${item.resourceId}`} item={item} timezone={timezone} />)}</div>)}
    {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="calendar-grid-row"><div className="calendar-hour-label">{String(hour).padStart(2, '0')}:00</div>{dates.map(date => {
      const slot = `${date}T${String(hour).padStart(2, '0')}:00:00`;
      return <div className="calendar-slot" key={date} onDragOver={event => { if (onMove && event.dataTransfer.types.includes('application/x-research-block')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => {
        if (!onMove) return;
        event.preventDefault();
        try { const payload = JSON.parse(event.dataTransfer.getData('application/x-research-block')) as { id: string; version: number }; const item = items.find(i => i.kind === 'block' && i.resourceId === payload.id && i.version === payload.version); if (!item) return;
          const bounds = event.currentTarget.getBoundingClientRect(), quarter = Math.min(3, Math.max(0, Math.floor((event.clientY - bounds.top) / bounds.height * 4)));
          onMove(item, `${date}T${String(hour).padStart(2, '0')}:${String(quarter * 15).padStart(2, '0')}:00`);
        } catch { /* Ignore unrelated drag payloads. */ }
      }}><button type="button" className="calendar-slot-button" aria-label={`${date} ${String(hour).padStart(2, '0')}:00 ${t.createSlot}`} onClick={() => onSlot(slot)} /><div className="slot-items">{items.filter(item => !item.date && onDate(item, date, timezone) && (calendarDateAt(item.startAt!, timezone) < date ? hour === 0 : Number(localDateTimeAt(item.startAt!, timezone).slice(11, 13)) === hour)).map(item => {
        const localStart = localDateTimeAt(item.startAt!, timezone), startDate = localStart.slice(0, 10);
        const start = startDate < date ? 0 : Number(localStart.slice(11, 13)) * 60 + Number(localStart.slice(14, 16));
        const localEnd = item.endAt ? localDateTimeAt(item.endAt, timezone) : null;
        const end = localEnd ? localEnd.slice(0, 10) > date ? 1440 : Number(localEnd.slice(11, 13)) * 60 + Number(localEnd.slice(14, 16)) : start + 30;
        return <Item key={`${item.kind}:${item.resourceId}`} item={item} timezone={timezone} onDrag={item.kind === 'block' && onMove ? event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-research-block', JSON.stringify({ id: item.resourceId, version: item.version })); } : undefined} placement={{ top: (start % 60) * 64 / 60 + 2, height: Math.max(30, (end - start) * 64 / 60 - 4) }} />;
      })}</div></div>;
    })}</div>)}
  </div></div>;
}
