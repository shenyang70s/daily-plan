CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL UNIQUE, endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL, auth TEXT NOT NULL, vapid_public_key TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  last_error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(id,user_id)
) STRICT;
CREATE INDEX push_subscriptions_user_session ON push_subscriptions(user_id,session_id,active);
CREATE TABLE push_deliveries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL, reminder_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','sent','failed','canceled')),
  lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
  last_error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(notification_id,subscription_id),
  FOREIGN KEY(subscription_id,user_id) REFERENCES push_subscriptions(id,user_id) ON DELETE CASCADE
) STRICT;
CREATE INDEX push_deliveries_claim ON push_deliveries(status,next_attempt_at,lease_until);
