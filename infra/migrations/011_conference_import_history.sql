CREATE TABLE conference_import_snapshots (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL, commit_sha TEXT NOT NULL,
  snapshot_json TEXT NOT NULL, first_seen_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,submission_id,commit_sha),
  FOREIGN KEY(submission_id,user_id) REFERENCES submissions(id,user_id) ON DELETE CASCADE
) STRICT;
INSERT OR IGNORE INTO conference_import_snapshots(user_id,submission_id,commit_sha,snapshot_json,first_seen_at)
SELECT user_id,submission_id,commit_sha,snapshot_json,created_at FROM conference_imports;
