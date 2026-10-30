-- Preserve existing identities and child records while removing OIDC-specific names.
ALTER TABLE users RENAME COLUMN oidc_issuer TO identity_provider;
ALTER TABLE users RENAME COLUMN oidc_subject TO identity_subject;
CREATE TABLE local_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE CHECK(length(username) BETWEEN 3 AND 32),
  password_hash TEXT NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
