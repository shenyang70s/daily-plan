import type { Transaction, SqlValue } from './database.js';
export type Row = Record<string, unknown>;
export function taskRecord(reader: Pick<Transaction, 'get'>, userId: string, id: string): Row | undefined {
  return reader.get('SELECT * FROM tasks WHERE id=? AND user_id=?', id, userId);
}
export function taskRecords(reader: Pick<Transaction, 'all'>, userId: string): Row[] {
  return reader.all('SELECT * FROM tasks WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC', userId);
}
export function taskBlocks(reader: Pick<Transaction, 'all'>, userId: string): Row[] {
  return reader.all('SELECT b.* FROM task_schedule_blocks b JOIN tasks t ON t.id=b.task_id AND t.user_id=b.user_id WHERE b.user_id=? AND b.status=? AND t.deleted_at IS NULL ORDER BY b.start_at,b.id', userId, 'confirmed');
}
export function insertTask(tx: Transaction, row: Record<string, SqlValue>): void {
  const columns = Object.keys(row);
  tx.run(`INSERT INTO tasks(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`, ...Object.values(row));
}
export function updateTask(tx: Transaction, userId: string, id: string, expectedVersion: number, values: Record<string, SqlValue>): number {
  return Number(tx.run(`UPDATE tasks SET ${Object.keys(values).map(column => `${column}=?`).join(',')},version=version+1 WHERE id=? AND user_id=? AND version=?`, ...Object.values(values), id, userId, expectedVersion).changes);
}
