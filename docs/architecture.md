# Workflow Architecture

## Entrypoints

- `PMF Brainstormer API`
  - validates input
  - inserts the run row
  - returns `202`
  - executes research + 5 Gemini stages
  - persists stage logs, gate state, final result, and control-plane state
- `PMF Brainstormer Status API`
  - returns current run state, final output, gate decision, and control-plane metadata
- `PMF Brainstormer Review API`
  - accepts operator review decisions
  - resolves runs in `awaiting_review`
  - updates both Postgres and Airtable gate state
- `PMF Brainstormer Error Handler`
  - marks matching runs as `failed` using `n8n_execution_id`
  - patches Airtable when a run fails after intake

## Subflows

- `PMF Research Subflow`
  - runs 3 Exa searches in parallel
  - normalizes source data
  - raises an error if no usable sources are returned
- `PMF Gemini Stage Subflow`
  - accepts a resolved `stage_config`
  - calls Gemini with JSON schema output
  - validates schema shape, types, enums, and required keys
  - respects runtime `max_attempts`
  - falls back to explicit incomplete output when retries fail
- `PMF Airtable Control Plane Subflow`
  - loads runtime prompt config from Airtable `Prompt Configs`
  - upserts runs, stage attempts, gate decisions, and experiments
  - stays best-effort so Airtable issues do not take down the core workflow

## Persistence

- `pmf_runs`
  - one row per request
  - current lifecycle state
  - final result payload
  - control-plane state
  - warnings and error summary
- `pmf_stage_runs`
  - one row per stage attempt
  - attempt status
  - raw and parsed response snapshots
  - resolved provider/model/schema/config metadata
- `pmf_gate_decisions`
  - one current review gate row per run
  - review reasons
  - operator decision and notes

## Reliability Decisions

- Async response by default to avoid long webhook timeouts.
- File-based subflows to keep the repo portable and remove DB-linked workflow ID coupling.
- Gemini output is constrained both by model-side JSON schema and workflow-side deterministic validation.
- Airtable `Prompt Configs` can drive runtime behavior, but code-defined stage defaults remain the fallback path.
- Stage logs are idempotent on `(run_id, stage_key, attempt)`.
- Airtable write paths use upsert semantics where possible to reduce duplicate operator state.
- Degraded states are explicit through warnings, review-gate metadata, incomplete stage payloads, and persisted stage logs.
