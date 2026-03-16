# PMF Brainstormer

Public case study for a modular `n8n` automation system designed to show production-minded workflow architecture rather than a simple trigger-action demo.

## What The System Covers

- async webhook ingestion with immediate `202` acceptance
- separate polling endpoint for run status
- operator review endpoint for gated runs
- parallel external research before AI synthesis
- reusable sub-workflows instead of one oversized canvas
- structured LLM output enforcement with schema checks and retries
- Postgres-backed auditability for runs, stage attempts, and gate decisions
- Airtable control-plane model for runtime config and operator visibility

## Architecture Shape

### Entrypoints

- `PMF Brainstormer API`
  - validates inbound payloads
  - inserts a run row
  - returns `202`
  - launches the research and AI analysis path
- `PMF Brainstormer Status API`
  - reads the current state and final output
- `PMF Brainstormer Review API`
  - accepts operator decisions for gated runs
- `PMF Brainstormer Error Handler`
  - catches true execution failures and marks the run failed

### Subflows

- `PMF Research Subflow`
  - runs multiple Exa searches in parallel
  - normalizes usable source data
  - fails loudly if there is not enough source signal
- `PMF Gemini Stage Subflow`
  - accepts a resolved stage config
  - requests a schema-constrained Gemini response
  - validates required keys and nested structure again in code
  - retries malformed outputs
  - emits explicit incomplete payloads when retries are exhausted
- `PMF Airtable Control Plane Subflow`
  - loads runtime prompt config from Airtable `Prompt Configs`
  - upserts runs, stage attempts, gates, and experiments
  - stays best-effort so Airtable issues become visible warnings instead of hard workflow failures

### Persistence

- `pmf_runs`
  - lifecycle state
  - warnings
  - final output
  - failure summary
- `pmf_stage_runs`
  - stage-level attempts
  - raw model output
  - parsed payload
  - runtime-config metadata
- `pmf_gate_decisions`
  - gate reasons
  - operator decision
  - operator notes

## JSON Reliability Approach

The system does not treat “structured output” as guaranteed. Reliability is enforced in layers:

1. The model is instructed to return JSON that matches a schema.
2. The workflow parses the output and validates required keys, enums, arrays, nested objects, and scalar types again.
3. Malformed outputs retry instead of being accepted silently.
4. A failed stage returns an explicit incomplete object and warning trail rather than an untyped blob.

This makes degraded states inspectable and keeps later stages from assuming that malformed upstream data is trustworthy.

## Silent-Failure Prevention

- Async processing keeps long-running work out of a blocking request window.
- Research has minimum-signal checks before the system proceeds.
- Stage attempts are logged even when a retry eventually succeeds.
- Final synthesis can move a run into `awaiting_review` instead of pretending the run is safe to auto-complete.
- A separate review webhook resolves gated runs explicitly.
- A separate error workflow records hard failures that stop execution.

## Deployment Recommendation

- static portfolio site on Netlify
- `n8n + Postgres` on a VPS or container host with persistent storage
- Airtable as SaaS
- Gemini and Exa secrets held only on the backend

Netlify is a good host for the public case study. It is not the right place to run the long-lived `n8n` runtime itself.

## What Makes This Portfolio Piece Useful

This project is designed to show the parts of automation work that usually matter in delivery:

- modular workflow boundaries
- error handling
- data contracts
- persistence
- operator visibility
- deployment realism

The public site in `site/` is static and safe to publish. Live backend links are configured through `site/config.js`, which contains placeholders only.
