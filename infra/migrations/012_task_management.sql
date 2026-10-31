ALTER TABLE ai_runs ADD COLUMN origin TEXT NOT NULL DEFAULT 'model' CHECK(origin IN ('model','manual'));
CREATE TABLE ai_delete_confirmations (
  run_id TEXT PRIMARY KEY REFERENCES ai_runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE ai_execution_undos (
  run_id TEXT PRIMARY KEY REFERENCES ai_executions(run_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL, result_json TEXT, expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE ai_undo_audits (
  run_id TEXT NOT NULL REFERENCES ai_execution_undos(run_id) ON DELETE CASCADE,
  action_index INTEGER NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
  PRIMARY KEY(run_id,action_index)
) STRICT;
