-- Research-protocol fields that must be complete before participant content can be published.
CREATE TABLE IF NOT EXISTS project_research_governance (
  project_id TEXT PRIMARY KEY,
  public_title TEXT NOT NULL,
  official_study_name TEXT NOT NULL,
  institution TEXT NOT NULL,
  principal_investigator TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  participation_time TEXT NOT NULL,
  purpose TEXT NOT NULL,
  eligibility_criteria TEXT NOT NULL,
  minimum_age INTEGER NOT NULL DEFAULT 18 CHECK (minimum_age >= 0),
  consent_version TEXT NOT NULL,
  retention_period TEXT NOT NULL,
  retention_disposal TEXT NOT NULL,
  data_use TEXT NOT NULL,
  risks TEXT NOT NULL,
  benefits TEXT NOT NULL,
  withdrawal_policy TEXT NOT NULL,
  ineligible_policy TEXT NOT NULL,
  duplicate_policy TEXT NOT NULL,
  collect_nationality INTEGER NOT NULL DEFAULT 0 CHECK (collect_nationality IN (0, 1)),
  nationality_purpose TEXT,
  transform_field TEXT NOT NULL DEFAULT 'range' CHECK (transform_field IN ('range', 'none')),
  verified_consent_languages TEXT NOT NULL,
  ethics_status TEXT NOT NULL DEFAULT 'not-submitted' CHECK (ethics_status IN ('not-submitted', 'reviewing', 'approved')),
  ethics_reference TEXT,
  debriefing TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES research_projects(id)
);

-- A published participant experience is immutable. Later edits create a new version.
CREATE TABLE IF NOT EXISTS project_publication_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  consent_version TEXT NOT NULL,
  configuration_json TEXT NOT NULL,
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, version),
  FOREIGN KEY (project_id) REFERENCES research_projects(id)
);

CREATE INDEX IF NOT EXISTS idx_project_publication_snapshots_project
  ON project_publication_snapshots(project_id, version DESC);
