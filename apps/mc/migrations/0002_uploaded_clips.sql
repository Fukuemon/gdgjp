-- Clips added from the controller. The audio lives in R2 (AUDIO, key
-- "clips/<id>"); bundled clips stay in app/features/clips/clips.json.
CREATE TABLE uploaded_clip (
  id TEXT PRIMARY KEY,
  -- NULL = the common standby shelf.
  track TEXT,
  -- Placed right after this clip in its group; NULL = first.
  after_id TEXT,
  title TEXT NOT NULL,
  file TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  -- JSON [{ "s": ms, "e": ms, "t": text }]
  segments TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
