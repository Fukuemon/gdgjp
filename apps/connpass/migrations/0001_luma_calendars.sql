CREATE TABLE luma_calendars (
  calendar_api_id TEXT PRIMARY KEY NOT NULL,
  chapter_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX luma_calendars_chapter_id_idx ON luma_calendars (chapter_id);
