CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  study_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
  age_group TEXT NOT NULL,
  language_background TEXT NOT NULL,
  first_language TEXT NOT NULL,
  second_language TEXT NOT NULL,
  language_learning_years REAL NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS task_recordings (
  submission_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  audio_bytes INTEGER NOT NULL,
  transform_profile TEXT NOT NULL,
  transform_version TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  PRIMARY KEY (submission_id, task_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_recordings_submission ON task_recordings(submission_id);

