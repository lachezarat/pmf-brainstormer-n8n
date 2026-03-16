ALTER TABLE pmf_runs
ADD COLUMN IF NOT EXISTS control_plane_state jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pmf_runs_control_plane_state
  ON pmf_runs
  USING gin (control_plane_state);
