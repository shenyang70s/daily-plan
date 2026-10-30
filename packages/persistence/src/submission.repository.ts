import type { Transaction, SqlValue } from './database.js';
type Reader = Pick<Transaction, 'get' | 'all'>;
export function submissionRecord(reader: Reader, userId: string, id: string) { return reader.get('SELECT * FROM submissions WHERE user_id=? AND id=?', userId, id); }
export function submissionRecords(reader: Reader, userId: string) { return reader.all('SELECT * FROM submissions WHERE user_id=? ORDER BY created_at DESC,id DESC', userId); }
export function milestoneRecord(reader: Reader, userId: string, id: string) { return reader.get('SELECT * FROM submission_milestones WHERE user_id=? AND id=?', userId, id); }
export function milestoneRecords(reader: Reader, userId: string, submissionId: string) { return reader.all('SELECT * FROM submission_milestones WHERE user_id=? AND submission_id=? ORDER BY created_at,id', userId, submissionId); }
export function calendarMilestones(reader: Reader, userId: string) { return reader.all('SELECT m.*,s.name AS submission_name FROM submission_milestones m JOIN submissions s ON m.submission_id=s.id AND m.user_id=s.user_id WHERE m.user_id=? AND s.archived_at IS NULL', userId); }
export function insertSubmissionRecord(tx: Transaction, kind: 'submission' | 'milestone', values: Record<string, SqlValue>): void {
  tx.run(`INSERT INTO ${kind === 'submission' ? 'submissions' : 'submission_milestones'}(${Object.keys(values).join(',')}) VALUES(${Object.keys(values).map(() => '?').join(',')})`, ...Object.values(values));
}
export function updateSubmissionRecord(tx: Transaction, kind: 'submission' | 'milestone', userId: string, id: string, values: Record<string, SqlValue>): void {
  tx.run(`UPDATE ${kind === 'submission' ? 'submissions' : 'submission_milestones'} SET ${Object.keys(values).map(column => `${column}=?`).join(',')},version=version+1 WHERE user_id=? AND id=?`, ...Object.values(values), userId, id);
}
