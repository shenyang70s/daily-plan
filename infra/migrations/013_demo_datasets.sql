CREATE TABLE demo_datasets (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dataset_key TEXT NOT NULL, manifest_json TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,dataset_key)
) STRICT;
