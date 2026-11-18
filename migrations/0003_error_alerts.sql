CREATE TABLE IF NOT EXISTS urithiru_error_alerts (
  alert_key text PRIMARY KEY,
  attempt_id text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('processing', 'sent', 'failed', 'unknown')),
  error_count integer NOT NULL,
  error text
);
