ALTER TABLE ai_runs ADD COLUMN parent_run_id TEXT REFERENCES ai_runs(id) ON DELETE SET NULL;
ALTER TABLE ai_runs ADD COLUMN scope_json TEXT;
ALTER TABLE ai_runs ADD COLUMN context_json TEXT;
CREATE INDEX ai_runs_parent ON ai_runs(parent_run_id,user_id);
CREATE TABLE ai_executions (
  run_id TEXT PRIMARY KEY REFERENCES ai_runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL, created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE ai_action_audits (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES ai_executions(run_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_index INTEGER NOT NULL, action_json TEXT NOT NULL, before_json TEXT NOT NULL,
  after_json TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(run_id,action_index)
) STRICT;
