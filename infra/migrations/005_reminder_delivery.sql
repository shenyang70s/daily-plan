ALTER TABLE reminders ADD COLUMN mode TEXT NOT NULL DEFAULT 'absolute' CHECK(mode IN ('absolute','relative'));
ALTER TABLE reminders ADD COLUMN offset_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reminders ADD COLUMN date_time TEXT;
ALTER TABLE reminders ADD COLUMN target_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reminders ADD COLUMN target_signature TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ADD COLUMN reminder_id TEXT REFERENCES reminders(id) ON DELETE SET NULL;
CREATE INDEX notifications_user_unread ON notifications(user_id,read_at);
