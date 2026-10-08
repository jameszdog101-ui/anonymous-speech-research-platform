PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS research_projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  owner_email TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_researchers (
  project_id TEXT NOT NULL,
  researcher_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'researcher'
    CHECK (role IN ('researcher', 'manager')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, researcher_email),
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_sample_tags (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, label),
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submission_tags (
  submission_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  applied_by TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (submission_id, tag_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES project_sample_tags(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS project_star_definitions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  color_key TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, color_key),
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submission_stars (
  submission_id TEXT PRIMARY KEY,
  star_definition_id TEXT NOT NULL,
  applied_by TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (star_definition_id) REFERENCES project_star_definitions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS project_research_notes (
  project_id TEXT PRIMARY KEY,
  division_of_labor TEXT NOT NULL DEFAULT '',
  other_notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_note_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  division_of_labor TEXT NOT NULL,
  other_notes TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  edited_at TEXT NOT NULL,
  UNIQUE (project_id, revision),
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_researchers_email
  ON project_researchers(researcher_email, status);
CREATE INDEX IF NOT EXISTS idx_project_tags_project
  ON project_sample_tags(project_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_submission_tags_tag
  ON submission_tags(tag_id, submission_id);
CREATE INDEX IF NOT EXISTS idx_project_stars_project
  ON project_star_definitions(project_id, is_active, sort_order);

