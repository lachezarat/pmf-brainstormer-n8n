# Airtable Control Plane

This project uses Airtable as the operator-facing control plane and Postgres as the durable execution ledger.

If you want the exact bootstrap sequence, use [airtable-setup.md](/home/lucho/contra/docs/airtable-setup.md#L1). It includes importable CSV templates, field types, link setup, env wiring, and a smoke test path.

## Why Airtable Exists Here

Postgres stores the authoritative execution history for the workflow engine. Airtable is layered on top for:

- operator visibility
- relational review state
- runtime prompt configuration
- manual gate decisions
- experiment follow-up tracking
- lightweight handoff to non-engineering stakeholders

## Suggested Base Schema

### `Runs`

Primary fields:

- `Run ID`
- `Status`
- `Idea`
- `Target Audience`
- `Monetization Guess`
- `N8N Execution ID`
- `Verdict`
- `Overall Score`
- `Review Gate Status`
- `Review Reasons JSON`
- `Warnings JSON`
- `Control Plane State JSON`
- `Completed At`

Linked fields:

- `Stage Attempts`
- `Gate Decisions`
- `Experiments`

### `Stage Attempts`

Primary fields:

- `External Key`
- `Run`
- `Run ID`
- `Stage Key`
- `Attempt`
- `Status`
- `Latency MS`
- `Warning Count`
- `Warning Summary`
- `Warning Details JSON`
- `Raw Response JSON`
- `Parsed Response JSON`
- `Provider`
- `Model`
- `Schema Version`
- `Config Source`
- `Config Snapshot JSON`

### `Gate Decisions`

Primary fields:

- `External Key`
- `Run`
- `Run ID`
- `Gate Type`
- `Decision Status`
- `Reason Summary`
- `Reason Details JSON`
- `Operator`
- `Operator Notes`
- `Source`
- `Created At`
- `Decided At`

### `Experiments`

Primary fields:

- `External Key`
- `Run`
- `Run ID`
- `Name`
- `Description`
- `Cost Estimate`
- `Time Estimate`
- `Success Metric`
- `Status`
- `Created At`

### `Prompt Configs`

The `Prompt Configs` table is runtime-active. The workflow attempts to load the matching enabled config for each Gemini stage before execution.

Suggested fields:

- `Stage Key`
- `Enabled`
- `Provider`
- `Model`
- `Temperature`
- `Max Attempts`
- `Schema Version`
- `Prompt Template`
- `Required Keys JSON`
- `Schema JSON`
- `Fallback JSON`

Behavior:

- if a matching enabled record exists, the stage uses that runtime config
- if lookup fails or config is missing, the stage falls back to the code-defined default
- the resolved config snapshot is logged into `pmf_stage_runs` and synced to Airtable `Stage Attempts`

Starter seed data is included in [prompt-configs.csv](/home/lucho/contra/fixtures/airtable/prompt-configs.csv#L1).

Importable starter table templates are included in [fixtures/airtable/](/home/lucho/contra/fixtures/airtable).

## Workflow Behavior

When `AIRTABLE_CONTROL_PLANE_ENABLED=true`, the workflow:

1. upserts a `Runs` record after intake
2. loads `Prompt Configs` before each Gemini stage
3. upserts `Stage Attempts` after research and every Gemini stage
4. upserts the `Runs` record at finalization
5. upserts a `Gate Decisions` record when manual review is required or resolved
6. upserts `Experiments` records from the validation planner output
7. upserts the `Runs` record to `failed` from the error workflow when a run crashes after intake

When Airtable is disabled or misconfigured, the workflow keeps running and records a visible warning instead of failing silently.

## Environment Variables

- `AIRTABLE_CONTROL_PLANE_ENABLED`
- `AIRTABLE_TOKEN`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_RUNS_TABLE`
- `AIRTABLE_STAGE_ATTEMPTS_TABLE`
- `AIRTABLE_GATE_DECISIONS_TABLE`
- `AIRTABLE_EXPERIMENTS_TABLE`
- `AIRTABLE_PROMPT_CONFIGS_TABLE`
