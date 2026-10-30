CREATE TABLE conference_catalog_snapshots (
  commit_sha TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, checked_at INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL
) STRICT;
CREATE TABLE conference_imports (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL, submission_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL, file_path TEXT NOT NULL, fetched_at INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,candidate_id),
  FOREIGN KEY(submission_id,user_id) REFERENCES submissions(id,user_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX conference_imports_submission ON conference_imports(user_id,submission_id);
