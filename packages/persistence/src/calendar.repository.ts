import type { Transaction, SqlValue } from './database.js';
type Reader = Pick<Transaction, 'all' | 'get'>;
export function eventRecord(reader: Reader, userId: string, id: string) { return reader.get('SELECT * FROM calendar_events WHERE user_id=? AND id=?', userId, id); }
export function eventRecords(reader: Reader, userId: string) { return reader.all('SELECT * FROM calendar_events WHERE user_id=? ORDER BY start_at,id', userId); }
export function blockRecord(reader: Reader, userId: string, id: string) { return reader.get('SELECT b.*,t.title,t.version AS task_version,t.status AS task_status,t.archived_at FROM task_schedule_blocks b JOIN tasks t ON t.id=b.task_id AND t.user_id=b.user_id WHERE b.user_id=? AND b.id=? AND t.deleted_at IS NULL', userId, id); }
export function blockRecords(reader: Reader, userId: string) { return reader.all("SELECT b.*,t.title,t.version AS task_version FROM task_schedule_blocks b JOIN tasks t ON t.id=b.task_id AND t.user_id=b.user_id WHERE b.user_id=? AND b.status='confirmed' AND t.deleted_at IS NULL AND t.archived_at IS NULL AND t.status!='canceled' ORDER BY b.start_at,b.id", userId); }
export function preparationTasks(reader: Reader, userId: string, eventId: string) { return reader.all('SELECT t.id,t.title FROM event_preparation_tasks p JOIN tasks t ON t.id=p.task_id AND t.user_id=p.user_id WHERE p.user_id=? AND p.event_id=? AND t.deleted_at IS NULL', userId, eventId); }
export function insertCalendarRecord(tx: Transaction, kind: 'event' | 'block', row: Record<string, SqlValue>): void {
  tx.run(`INSERT INTO ${kind === 'event' ? 'calendar_events' : 'task_schedule_blocks'}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`, ...Object.values(row));
}
export function updateCalendarRecord(tx: Transaction, kind: 'event' | 'block', userId: string, id: string, values: Record<string, SqlValue>): void {
  tx.run(`UPDATE ${kind === 'event' ? 'calendar_events' : 'task_schedule_blocks'} SET ${Object.keys(values).map(column => `${column}=?`).join(',')},version=version+1 WHERE id=? AND user_id=?`, ...Object.values(values), id, userId);
}
