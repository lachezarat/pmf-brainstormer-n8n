# Handoff

## Import Order

Import these entry workflows into `n8n`:

1. `workflows/entrypoints/pmf-brainstorm-api.json`
2. `workflows/entrypoints/pmf-brainstorm-status.json`
3. `workflows/entrypoints/pmf-brainstorm-review.json`
4. `workflows/entrypoints/pmf-error-handler.json`

The parent workflow loads these subflows from disk:

- `workflows/subflows/pmf-research.json`
- `workflows/subflows/pmf-gemini-stage.json`
- `workflows/subflows/pmf-airtable-control-plane.json`

## Required n8n Setup

- create one `Postgres` credential and reuse it on every Postgres node
- set `PMF Brainstormer API -> Settings -> Error Workflow -> PMF Brainstormer Error Handler`
- activate:
  - `PMF Brainstormer API`
  - `PMF Brainstormer Status API`
  - `PMF Brainstormer Review API`

## Airtable Setup

Use [airtable-setup.md](airtable-setup.md) for the exact setup sequence.

Quick version:

1. import the CSV templates from [fixtures/airtable/](../fixtures/airtable/)
2. rename the tables to:
   - `Runs`
   - `Stage Attempts`
   - `Gate Decisions`
   - `Experiments`
   - `Prompt Configs`
3. convert the `Run` field in child tables into a linked record to `Runs`
4. convert `Enabled` in `Prompt Configs` to a checkbox
5. set the Airtable env vars and restart `n8n`

## Runtime Behavior

- Airtable disabled:
  - workflow uses code-defined stage defaults
  - sync calls are skipped
- Airtable enabled and healthy:
  - workflow loads prompt config before each Gemini stage
  - writes run, stage, gate, and experiment state into Airtable
- Airtable enabled but misconfigured:
  - workflow keeps running
  - warnings are persisted and surfaced in status output

## Review Flow

1. Run enters `awaiting_review` when synthesis determines manual review is required.
2. Operator submits `POST /webhook/pmf-brainstorm-review`.
3. Review webhook upserts `pmf_gate_decisions`.
4. Run status moves to:
   - `completed`
   - `rejected`
   - `needs_changes`
5. Airtable `Gate Decisions` is updated to reflect the operator outcome.

Sample payload: [request.review.json](../fixtures/request.review.json)

## Backup And Restore

Create a handoff bundle:

```bash
node scripts/create-backup-bundle.mjs
```

The bundle includes:

- generated workflows
- SQL migrations
- docs
- fixtures

For an existing database volume, apply:

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/002_control_plane_state.sql
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/003_runtime_control_plane.sql
```
