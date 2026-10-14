-- Server-backed state for the redesigned multi-project researcher portal.
CREATE TABLE IF NOT EXISTS admin_workspaces (
  workspace_key TEXT PRIMARY KEY,
  configuration_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

