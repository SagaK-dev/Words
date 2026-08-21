CREATE TABLE IF NOT EXISTS sync_blobs (
  code TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
