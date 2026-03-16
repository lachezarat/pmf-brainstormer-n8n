# Airtable Setup

This is the fastest way to stand up the Airtable control plane for this project without guessing field names.

Important rule:

- do not rename fields
- start with simple field types first
- get sync working before you make the base prettier

The workflow writes to Airtable by exact field name. If a field name does not match, Airtable sync will fail and the run will surface a warning.

## Fastest Setup Path

1. Create a base named `PMF Brainstormer Control Plane`.
2. Import these CSV templates as separate tables:
   - [runs-template.csv](/home/lucho/contra/fixtures/airtable/runs-template.csv)
   - [stage-attempts-template.csv](/home/lucho/contra/fixtures/airtable/stage-attempts-template.csv)
   - [gate-decisions-template.csv](/home/lucho/contra/fixtures/airtable/gate-decisions-template.csv)
   - [experiments-template.csv](/home/lucho/contra/fixtures/airtable/experiments-template.csv)
3. Import [prompt-configs.csv](/home/lucho/contra/fixtures/airtable/prompt-configs.csv) as the `Prompt Configs` table.
4. Convert the field types listed below.
5. Convert the `Run` field in `Stage Attempts`, `Gate Decisions`, and `Experiments` into a linked record field pointing to `Runs`.
6. Create a Personal Access Token in Airtable with record read and write access to this base.
7. Copy the Airtable base ID and set the Airtable env vars in [.env](/home/lucho/contra/.env#L1).
8. Restart `n8n`.
9. Run one request, poll status, and confirm records appear in Airtable.

## Exact Field Types

Use these as the baseline. Once sync is working, you can make the UI nicer.

### `Runs`

- `Run ID`: single line text
- `Status`: single line text
- `Idea`: long text
- `Target Audience`: long text
- `Monetization Guess`: long text
- `N8N Execution ID`: single line text
- `Verdict`: single line text
- `Overall Score`: number
- `One-line Summary`: long text
- `Top Strength`: long text
- `Top Risk`: long text
- `Review Gate Status`: single line text
- `Review Reasons JSON`: long text
- `Warnings JSON`: long text
- `Control Plane State JSON`: long text
- `Error Summary JSON`: long text
- `Created At`: date with time
- `Completed At`: date with time

### `Stage Attempts`

- `External Key`: single line text
- `Run`: linked record to `Runs`
- `Run ID`: single line text
- `N8N Execution ID`: single line text
- `Stage Key`: single line text
- `Attempt`: number
- `Status`: single line text
- `Latency MS`: number
- `Warning Count`: number
- `Warning Summary`: long text
- `Warning Details JSON`: long text
- `Raw Response JSON`: long text
- `Parsed Response JSON`: long text
- `Provider`: single line text
- `Model`: single line text
- `Schema Version`: single line text
- `Config Source`: single line text
- `Config Snapshot JSON`: long text
- `Created At`: date with time

### `Gate Decisions`

- `External Key`: single line text
- `Run`: linked record to `Runs`
- `Run ID`: single line text
- `Gate Type`: single line text
- `Decision Status`: single line text
- `Reason Summary`: long text
- `Reason Details JSON`: long text
- `Operator`: single line text
- `Operator Notes`: long text
- `Source`: single line text
- `Created At`: date with time
- `Decided At`: date with time

### `Experiments`

- `External Key`: single line text
- `Run`: linked record to `Runs`
- `Run ID`: single line text
- `Name`: single line text
- `Description`: long text
- `Cost Estimate`: single line text
- `Time Estimate`: single line text
- `Success Metric`: long text
- `Status`: single line text
- `Created At`: date with time

### `Prompt Configs`

- `Stage Key`: single line text
- `Enabled`: checkbox
- `Provider`: single line text
- `Model`: single line text
- `Temperature`: number
- `Max Attempts`: number
- `Schema Version`: single line text
- `Prompt Template`: long text
- `Required Keys JSON`: long text
- `Schema JSON`: long text
- `Fallback JSON`: long text
- `Notes`: long text

## Linked Record Setup

Only three linked fields matter for the workflow:

- `Stage Attempts -> Run`
- `Gate Decisions -> Run`
- `Experiments -> Run`

Point all three to `Runs`.

You do not need to manually create backlink fields in `Runs`. Airtable will create them automatically when the linked `Run` fields are set up, and that is enough for the schema screenshot.

## Airtable Token And Base ID

Create a Personal Access Token for this base.

Minimum practical scopes:

- record read
- record write

Grant the token access to the specific base, not your whole workspace.

The Airtable base ID is the `app...` identifier for the base. Grab it from Airtable's developer/API view for that base before you fill in the env vars.

Set these env vars in [.env](/home/lucho/contra/.env#L1):

- `AIRTABLE_CONTROL_PLANE_ENABLED=true`
- `AIRTABLE_TOKEN=<your_token>`
- `AIRTABLE_BASE_ID=<your_base_id>`
- `AIRTABLE_RUNS_TABLE=Runs`
- `AIRTABLE_STAGE_ATTEMPTS_TABLE=Stage Attempts`
- `AIRTABLE_GATE_DECISIONS_TABLE=Gate Decisions`
- `AIRTABLE_EXPERIMENTS_TABLE=Experiments`
- `AIRTABLE_PROMPT_CONFIGS_TABLE=Prompt Configs`

Then restart:

```bash
docker compose restart n8n
```

## Smoke Test

1. Create a run:

```bash
curl -X POST http://localhost:5678/webhook/pmf-brainstorm \
  -H 'Content-Type: application/json' \
  -d @fixtures/request.valid.json
```

2. Poll status until it reaches `awaiting_review` or `completed`.
3. Check Airtable:
   - `Runs` should contain one run row
   - `Stage Attempts` should contain stage rows
   - `Prompt Configs` should already exist from the seed import
4. If the run is gated, approve it:

```bash
curl -X POST http://localhost:5678/webhook/pmf-brainstorm-review \
  -H 'Content-Type: application/json' \
  -d @fixtures/request.review.json
```

5. Confirm:
   - `Gate Decisions` is updated
   - `Runs` moves to `completed`
   - `Experiments` contains validation-plan records

## Troubleshooting

- No Airtable records appear:
  - confirm `AIRTABLE_CONTROL_PLANE_ENABLED=true`
  - confirm `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID` are real values
  - restart `n8n` after env changes
- Runs complete but Airtable sync warns:
  - a field name likely does not match the expected Airtable field name
- Prompt configs are not taking effect:
  - confirm `Enabled` is checked
  - confirm `Stage Key` matches one of:
    - `market_scanner`
    - `persona_builder`
    - `risk_assessor`
    - `validation_planner`
    - `synthesis`
- Linked record fields fail:
  - make sure `Run` in child tables is a linked record field, not plain text

## Best Screenshots After Setup

Once Airtable is syncing, capture:

1. the Airtable sidebar showing the 5 tables
2. one `Runs` row with status and verdict
3. one `Stage Attempts` view with 5 or 6 stage rows
4. one `Gate Decisions` row after approval
5. one `Prompt Configs` view showing active stage configs
