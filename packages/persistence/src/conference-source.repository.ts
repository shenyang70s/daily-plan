import type { Transaction } from './database.js';
type Reader = Pick<Transaction, 'get' | 'all'>;
export function conferenceSnapshot(reader: Reader, sha: string) { return reader.get('SELECT * FROM conference_catalog_snapshots WHERE commit_sha=?', sha); }
export function latestConferenceSnapshot(reader: Reader) { return reader.get('SELECT * FROM conference_catalog_snapshots ORDER BY checked_at DESC LIMIT 1'); }
export function storeConferenceSnapshot(tx: Transaction, sha: string, snapshot: string, fetchedAt: number, checkedAt: number) {
  tx.run('INSERT INTO conference_catalog_snapshots(commit_sha,snapshot_json,fetched_at,checked_at) VALUES(?,?,?,?) ON CONFLICT(commit_sha) DO UPDATE SET checked_at=excluded.checked_at', sha, snapshot, fetchedAt, checkedAt);
}
export function conferenceImport(reader: Reader, userId: string, candidateId: string) { return reader.get('SELECT * FROM conference_imports WHERE user_id=? AND candidate_id=?', userId, candidateId); }
export function submissionConferenceSource(reader: Reader, userId: string, submissionId: string) { return reader.get('SELECT * FROM conference_imports WHERE user_id=? AND submission_id=?', userId, submissionId); }
