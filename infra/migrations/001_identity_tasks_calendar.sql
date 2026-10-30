CREATE TABLE users (
  id TEXT PRIMARY KEY, oidc_issuer TEXT NOT NULL, oidc_subject TEXT NOT NULL,
  display_name TEXT, created_at INTEGER NOT NULL,
  UNIQUE(oidc_issuer, oidc_subject)
) STRICT;
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  preferences_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, csrf_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(id,user_id)
) STRICT;
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT, title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  type TEXT NOT NULL CHECK(type IN ('experiment','paper_reading','learning','research','meeting_prep','personal','other')),
  status TEXT NOT NULL CHECK(status IN ('inbox','todo','in_progress','done','canceled')),
  priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
  due_date TEXT, due_at INTEGER, timezone TEXT,
  duration_minutes INTEGER CHECK(duration_minutes >= 0),
  note TEXT NOT NULL DEFAULT '', external_url TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  completed_at INTEGER, archived_at INTEGER, deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(id,user_id),
  FOREIGN KEY(project_id,user_id) REFERENCES projects(id,user_id),
  CHECK(due_date IS NULL OR due_at IS NULL),
  CHECK(due_at IS NULL OR timezone IS NOT NULL)
) STRICT;
CREATE INDEX tasks_user_status ON tasks(user_id,status,updated_at,id);
CREATE INDEX tasks_user_due_at ON tasks(user_id,due_at);
CREATE INDEX tasks_user_due_date ON tasks(user_id,due_date);
CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, timezone TEXT NOT NULL,
  location TEXT, external_url TEXT, note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(id,user_id), CHECK(end_at > start_at)
) STRICT;
CREATE INDEX calendar_events_range ON calendar_events(user_id,start_at,end_at);
CREATE TABLE task_schedule_blocks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
  timezone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','canceled')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(task_id,user_id) REFERENCES tasks(id,user_id) ON DELETE CASCADE,
  UNIQUE(id,user_id), CHECK(end_at > start_at)
) STRICT;
CREATE INDEX schedule_blocks_range ON task_schedule_blocks(user_id,start_at,end_at);
CREATE TABLE event_preparation_tasks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL, task_id TEXT NOT NULL,
  PRIMARY KEY(event_id,task_id),
  FOREIGN KEY(event_id,user_id) REFERENCES calendar_events(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(task_id,user_id) REFERENCES tasks(id,user_id) ON DELETE CASCADE
) STRICT;
CREATE TABLE idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,scope,key)
) STRICT;
