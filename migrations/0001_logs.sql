CREATE TABLE IF NOT EXISTS centralita_logs (
  id text NOT NULL,
  project_id text NOT NULL,
  deployment_id text NOT NULL DEFAULT '',
  timestamp timestamptz NOT NULL,
  level text NOT NULL,
  message text NOT NULL,
  path text NOT NULL DEFAULT '',
  status_code integer,
  source text NOT NULL,
  PRIMARY KEY (project_id, id)
);
CREATE INDEX IF NOT EXISTS centralita_logs_project_time ON centralita_logs (project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS centralita_logs_errors ON centralita_logs (timestamp DESC) WHERE level IN ('error', 'fatal') OR status_code >= 500;
