CREATE TABLE conference_milestone_bindings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL, kind TEXT NOT NULL,
  milestone_id TEXT REFERENCES submission_milestones(id) ON DELETE SET NULL,
  baseline_json TEXT NOT NULL,
  PRIMARY KEY(user_id,submission_id,kind),
  FOREIGN KEY(submission_id,user_id) REFERENCES submissions(id,user_id) ON DELETE CASCADE
) STRICT;
CREATE TABLE conference_update_proposals (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL, preview_json TEXT NOT NULL, decisions_json TEXT, result_json TEXT,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  FOREIGN KEY(submission_id,user_id) REFERENCES submissions(id,user_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX conference_update_owner ON conference_update_proposals(user_id,submission_id,created_at);
CREATE TABLE conference_update_audits (
  id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES conference_update_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, decision TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
  created_at INTEGER NOT NULL, UNIQUE(proposal_id,kind)
) STRICT;
