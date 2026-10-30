CREATE TABLE submissions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0), year INTEGER,
  round TEXT, stage TEXT NOT NULL DEFAULT 'planning' CHECK(stage IN ('planning','preparing','internal_review','submitted','under_review','rebuttal','decision','accepted','rejected','withdrawn')),
  submission_url TEXT, draft_url TEXT, next_action TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1, UNIQUE(id,user_id)
) STRICT;
CREATE TABLE submission_milestones (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL, kind TEXT NOT NULL,
  due_date TEXT, due_at INTEGER, timezone TEXT, source_timezone TEXT,
  source_url TEXT, official_url TEXT, verified_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(id,user_id),
  FOREIGN KEY(submission_id,user_id) REFERENCES submissions(id,user_id) ON DELETE CASCADE,
  CHECK(due_date IS NULL OR due_at IS NULL),
  CHECK(due_at IS NULL OR timezone IS NOT NULL)
) STRICT;
CREATE INDEX submission_milestones_user_due ON submission_milestones(user_id,due_at);
CREATE TABLE reminders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT, event_id TEXT, milestone_id TEXT,
  scheduled_for INTEGER NOT NULL, timezone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK(channel IN ('in_app','push')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','canceled')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(id,user_id),
  FOREIGN KEY(task_id,user_id) REFERENCES tasks(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(event_id,user_id) REFERENCES calendar_events(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(milestone_id,user_id) REFERENCES submission_milestones(id,user_id) ON DELETE CASCADE,
  CHECK((task_id IS NOT NULL)+(event_id IS NOT NULL)+(milestone_id IS NOT NULL)=1)
) STRICT;
CREATE INDEX reminders_due ON reminders(status,scheduled_for);
CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_id TEXT NOT NULL, scheduled_for INTEGER NOT NULL,
  delivery_key TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','sent','failed','canceled')),
  lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL, last_error_code TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  FOREIGN KEY(reminder_id,user_id) REFERENCES reminders(id,user_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX outbox_claim ON outbox_events(status,next_attempt_at,lease_until);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL,
  resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, read_at INTEGER, snoozed_until INTEGER
) STRICT;
CREATE INDEX notifications_user_created ON notifications(user_id,created_at,id);
