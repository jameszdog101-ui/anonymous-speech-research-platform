CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  study_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
  age_group TEXT NOT NULL,
  biological_sex TEXT NOT NULL CHECK (biological_sex IN ('male', 'female')),
  nationality TEXT NOT NULL,
  language_background TEXT NOT NULL,
  first_language TEXT NOT NULL,
  second_languages_json TEXT NOT NULL,
  mandarin_learning_years REAL NOT NULL,
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
  transform_parameters_json TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  PRIMARY KEY (submission_id, task_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_recordings_submission ON task_recordings(submission_id);

CREATE TABLE IF NOT EXISTS submission_reviews (
  submission_id TEXT PRIMARY KEY,
  eligibility_status TEXT NOT NULL CHECK (eligibility_status IN ('eligible', 'ineligible', 'undetermined')),
  notes TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS researcher_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  researcher_email TEXT NOT NULL,
  action TEXT NOT NULL,
  submission_id TEXT,
  task_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_status ON submission_reviews(eligibility_status);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON researcher_audit_log(created_at);

CREATE TABLE IF NOT EXISTS researchers (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('researcher', 'manager')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_tasks (
  task_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  research_instructions TEXT NOT NULL,
  max_playbacks INTEGER NOT NULL CHECK (max_playbacks BETWEEN 1 AND 2),
  max_recordings INTEGER NOT NULL CHECK (max_recordings BETWEEN 1 AND 2),
  audio_object_key TEXT,
  audio_content_type TEXT,
  sort_order INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  tasks_json TEXT NOT NULL,
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_researchers_status ON researchers(status);
CREATE INDEX IF NOT EXISTS idx_study_tasks_sort ON study_tasks(sort_order);

CREATE TABLE IF NOT EXISTS study_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1)),
  max_submissions INTEGER NOT NULL DEFAULT 100 CHECK (max_submissions > 0),
  closed_reason TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO study_control (id, is_open, max_submissions, updated_by, updated_at)
VALUES (1, 1, 100, 'system', '2026-10-07T00:00:00.000Z');

