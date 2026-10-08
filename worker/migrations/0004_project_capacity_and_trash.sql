PRAGMA foreign_keys = ON;

ALTER TABLE research_projects ADD COLUMN max_submissions INTEGER;
ALTER TABLE research_projects ADD COLUMN max_storage_bytes INTEGER;
ALTER TABLE research_projects ADD COLUMN auto_close_on_limit INTEGER NOT NULL DEFAULT 1
  CHECK (auto_close_on_limit IN (0, 1));
ALTER TABLE research_projects ADD COLUMN published_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_projects ADD COLUMN deleted_at TEXT;
ALTER TABLE research_projects ADD COLUMN deleted_by TEXT;
ALTER TABLE research_projects ADD COLUMN purge_after TEXT;

CREATE TABLE IF NOT EXISTS project_storage_objects (
  object_key TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  submission_id TEXT,
  object_kind TEXT NOT NULL CHECK (object_kind IN ('eligibility_audio', 'task_audio', 'stimulus_audio', 'other')),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  r2_etag TEXT,
  storage_class TEXT NOT NULL DEFAULT 'Standard',
  lifecycle_state TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'trash', 'purged')),
  deleted_at TEXT,
  purge_after TEXT,
  last_verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS project_capacity_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  active_audio_bytes INTEGER NOT NULL DEFAULT 0,
  trash_audio_bytes INTEGER NOT NULL DEFAULT 0,
  object_count INTEGER NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('object_ledger', 'r2_reconciliation')),
  measured_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trash_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  submission_id TEXT,
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('sample', 'project', 'project_audio_batch')),
  display_label TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  deletion_batch_id TEXT,
  deleted_by TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  purge_after TEXT NOT NULL,
  restored_at TEXT,
  restored_by TEXT,
  permanently_deleted_at TEXT,
  permanently_deleted_by TEXT,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS storage_reconciliation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  object_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS project_media_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  page_id TEXT,
  block_id TEXT,
  media_role TEXT NOT NULL CHECK (media_role IN ('device_test', 'speech_stimulus')),
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('audio/wav', 'audio/mp4', 'video/mp4')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'disabled')),
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (page_id) REFERENCES project_pages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_project_state
  ON project_storage_objects(project_id, lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_capacity_snapshots_project_time
  ON project_capacity_snapshots(project_id, measured_at);
CREATE INDEX IF NOT EXISTS idx_trash_entries_project_date
  ON trash_entries(project_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_trash_entries_purge_after
  ON trash_entries(purge_after, permanently_deleted_at);
CREATE INDEX IF NOT EXISTS idx_project_media_assets_page
  ON project_media_assets(project_id, page_id, status);
