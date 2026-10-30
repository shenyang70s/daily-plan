import type { Transaction } from './database.js';
export function projectRecord(reader: Pick<Transaction, 'get'>, userId: string, id: string) {
  return reader.get('SELECT * FROM projects WHERE id=? AND user_id=?', id, userId);
}
export function projectRecords(reader: Pick<Transaction, 'all'>, userId: string) {
  return reader.all('SELECT * FROM projects WHERE user_id=? ORDER BY created_at DESC,id DESC', userId);
}
export function insertProject(tx: Transaction, userId: string, id: string, name: string, now: number): void {
  tx.run('INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)', id, userId, name, now, now);
}
export function renameProject(tx: Transaction, userId: string, id: string, name: string, expectedVersion: number, now: number): void {
  tx.run('UPDATE projects SET name=?,updated_at=?,version=version+1 WHERE id=? AND user_id=? AND version=?', name, now, id, userId, expectedVersion);
}
export function deleteProject(tx: Transaction, userId: string, id: string, now: number): void {
  tx.run('UPDATE tasks SET project_id=NULL,updated_at=?,version=version+1 WHERE project_id=? AND user_id=?', now, id, userId);
  tx.run('DELETE FROM projects WHERE id=? AND user_id=?', id, userId);
}
