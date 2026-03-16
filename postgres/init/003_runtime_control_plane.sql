ALTER TYPE pmf_run_status ADD VALUE IF NOT EXISTS 'awaiting_review';
ALTER TYPE pmf_run_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE pmf_run_status ADD VALUE IF NOT EXISTS 'needs_changes';

ALTER TABLE pmf_stage_runs
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS schema_version text,
  ADD COLUMN IF NOT EXISTS config_source text,
  ADD COLUMN IF NOT EXISTS config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pmf_stage_runs_run_stage_attempt
  ON pmf_stage_runs (run_id, stage_key, attempt);

CREATE TABLE IF NOT EXISTS pmf_gate_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES pmf_runs(run_id) ON DELETE CASCADE,
  external_key text NOT NULL UNIQUE,
  gate_type text NOT NULL,
  decision_status text NOT NULL,
  review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  operator_name text,
  operator_notes text,
  source text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pmf_gate_decisions_run_id
  ON pmf_gate_decisions (run_id, updated_at DESC);
