CREATE TABLE IF NOT EXISTS urithiru_activity (
  username text NOT NULL,
  activity_date date NOT NULL,
  digest jsonb NOT NULL,
  generated_at timestamptz NOT NULL,
  PRIMARY KEY (username, activity_date)
);
