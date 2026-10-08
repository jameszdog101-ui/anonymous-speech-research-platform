PRAGMA foreign_keys = ON;

ALTER TABLE project_researchers ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE project_researchers ADD COLUMN display_name_updated_by TEXT;
ALTER TABLE project_researchers ADD COLUMN display_name_updated_at TEXT;

CREATE TABLE IF NOT EXISTS project_permissions (
  project_id TEXT NOT NULL,
  researcher_email TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (project_id, researcher_email, permission_key),
  FOREIGN KEY (project_id, researcher_email)
    REFERENCES project_researchers(project_id, researcher_email) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submission_assignments (
  submission_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  researcher_email TEXT,
  researcher_display_name_snapshot TEXT,
  assigned_by TEXT,
  assigned_at TEXT,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submission_analysis_state (
  submission_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  current_researcher_email TEXT,
  current_researcher_display_name_snapshot TEXT,
  completed_by TEXT,
  completed_by_display_name_snapshot TEXT,
  completed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submission_analysis_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('autosave', 'comment', 'direct_edit', 'status_change')),
  change_summary TEXT NOT NULL DEFAULT '',
  previous_content_json TEXT,
  new_content_json TEXT,
  edited_by TEXT NOT NULL,
  editor_display_name_snapshot TEXT NOT NULL,
  edited_at TEXT NOT NULL,
  UNIQUE (submission_id, revision),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_pages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  page_key TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, page_key),
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_page_blocks (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN (
    'heading', 'paragraph', 'notice', 'single_choice', 'multiple_choice',
    'text_field', 'number_field', 'select_field', 'divider', 'audio_task', 'consent'
  )),
  content_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (page_id) REFERENCES project_pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL,
  UNIQUE (project_id, version),
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_permissions_researcher
  ON project_permissions(researcher_email, project_id);
CREATE INDEX IF NOT EXISTS idx_assignments_project_researcher
  ON submission_assignments(project_id, researcher_email);
CREATE INDEX IF NOT EXISTS idx_analysis_state_project_status
  ON submission_analysis_state(project_id, status);
CREATE INDEX IF NOT EXISTS idx_analysis_revisions_submission
  ON submission_analysis_revisions(submission_id, edited_at);
CREATE INDEX IF NOT EXISTS idx_project_pages_project_order
  ON project_pages(project_id, sort_order);

