import { useEffect, useRef } from 'react';
import { calendarDateAt, localDateTimeAt } from '@research/domain';
import type { CalendarItem } from '@research/contracts';
import { calendarText as t } from '../../locales/zh-CN';
import { navigate } from '../../app/router';
const kindLabel = (item: CalendarItem) => item.kind === 'event' ? t.event : item.kind === 'block' ? t.block : t.milestone;
function onDate(item: CalendarItem, date: string, timezone: string): boolean {
  if (item.date) return item.date === date;
  if (!item.startAt) return false;
  const first = calendarDateAt(item.startAt, timezone), last = item.endAt ? calendarDateAt(new Date(Date.parse(item.endAt) - 1).toISOString(), timezone) : first;
  return first <= date && last >= date;
}
function Item({ item, timezone }: { item: CalendarItem; timezone: string }) {
  const time = item.startAt ? `${localDateTimeAt(item.startAt, timezone).slice(11, 16)}${item.endAt ? `–${localDateTimeAt(item.endAt, timezone).slice(11, 16)}` : ''}` : t.allDay;
  return <button type="button" className={`calendar-item item-${item.kind}`} title={`${item.title} · ${time} · ${timezone}`} aria-label={`${kindLabel(item)}：${item.title} ${time}`} onClick={() => navigate(item.kind === 'milestone' ? `/tasks/${item.resourceId}` : `/calendar/${item.kind === 'event' ? 'events' : 'blocks'}/${item.resourceId}`)}><span>{time}</span><strong>{item.title}</strong></button>;
}
export function CalendarGrid({ dates, items, timezone, view, onSlot }: { dates: string[]; items: CalendarItem[]; timezone: string; view: 'day' | 'week' | 'month'; onSlot: (slot: string) => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroll.current && view !== 'month') scroll.current.scrollTop = 8 * 64; }, [view, dates[0]]);
  if (view === 'month') return <div className="calendar-month-scroll"><div className="calendar-month-grid" role="group" aria-label={t.month}>{t.weekDays.map(day => <div className="month-weekday" key={day}>{day}</div>)}{dates.map(date => <div key={date} className="calendar-month-cell"><button type="button" className="month-date" aria-label={`${date} 09:00 ${t.createSlot}`} onClick={() => onSlot(`${date}T09:00:00`)}>{date.slice(5).replace('-', '/')}</button><div>{items.filter(item => onDate(item, date, timezone)).map(item => <Item key={`${item.kind}:${item.resourceId}`} item={item} timezone={timezone} />)}</div></div>)}</div></div>;
  return <div className="calendar-scroll" ref={scroll}><div className="calendar-time-grid" style={{ gridTemplateColumns: `56px repeat(${dates.length}, minmax(100px, 1fr))` }} role="group" aria-label={view === 'day' ? t.day : t.week}>
    <div className="calendar-corner">{timezone}</div>{dates.map((date, index) => <div className="calendar-day-header" key={date}>{date.slice(5).replace('-', '/')}<span>{view === 'week' ? t.weekDays[index] : ''}</span></div>)}
    <div className="calendar-hour-label calendar-all-day-label">{t.allDay}</div>{dates.map(date => <div className="calendar-allday" key={date}>{items.filter(item => item.date === date).map(item => <Item key={`${item.kind}:${item.resourceId}`} item={item} timezone={timezone} />)}</div>)}
    {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="calendar-grid-row"><div className="calendar-hour-label">{String(hour).padStart(2, '0')}:00</div>{dates.map(date => {
      const slot = `${date}T${String(hour).padStart(2, '0')}:00:00`;
      return <div className="calendar-slot" key={date}><button type="button" className="calendar-slot-button" aria-label={`${date} ${String(hour).padStart(2, '0')}:00 ${t.createSlot}`} onClick={() => onSlot(slot)} /><div className="slot-items">{items.filter(item => !item.date && onDate(item, date, timezone) && (calendarDateAt(item.startAt!, timezone) < date ? hour === 0 : Number(localDateTimeAt(item.startAt!, timezone).slice(11, 13)) === hour)).map(item => <Item key={`${item.kind}:${item.resourceId}`} item={item} timezone={timezone} />)}</div></div>;
    })}</div>)}
  </div></div>;
}
