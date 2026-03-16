CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'pmf_run_status'
  ) THEN
    CREATE TYPE pmf_run_status AS ENUM (
      'accepted',
      'running',
      'awaiting_review',
      'completed',
      'completed_with_warnings',
      'rejected',
      'needs_changes',
      'failed'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS pmf_runs (
  run_id uuid PRIMARY KEY,
  n8n_execution_id text UNIQUE,
  status pmf_run_status NOT NULL DEFAULT 'accepted',
  idea text NOT NULL,
  target_audience text NOT NULL,
  monetization_guess text NOT NULL,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  research_context jsonb,
  analysis_outputs jsonb,
  final_output jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pmf_runs_status ON pmf_runs (status);
CREATE INDEX IF NOT EXISTS idx_pmf_runs_created_at ON pmf_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmf_runs_execution_id ON pmf_runs (n8n_execution_id);

CREATE TABLE IF NOT EXISTS pmf_stage_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES pmf_runs(run_id) ON DELETE CASCADE,
  n8n_execution_id text,
  stage_key text NOT NULL,
  attempt integer NOT NULL,
  status text NOT NULL,
  latency_ms integer,
  warning_count integer NOT NULL DEFAULT 0,
  warning_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_response jsonb,
  parsed_response jsonb,
  provider text,
  model text,
  schema_version text,
  config_source text,
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pmf_stage_runs_run_id ON pmf_stage_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pmf_stage_runs_stage_key ON pmf_stage_runs (stage_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pmf_stage_runs_run_stage_attempt ON pmf_stage_runs (run_id, stage_key, attempt);

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

CREATE INDEX IF NOT EXISTS idx_pmf_gate_decisions_run_id ON pmf_gate_decisions (run_id, updated_at DESC);
