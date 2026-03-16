import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const repoRoot = process.cwd();
const entrypointDir = join(repoRoot, 'workflows', 'entrypoints');
const subflowDir = join(repoRoot, 'workflows', 'subflows');

const RESEARCH_SUBFLOW_PATH = '/files/workflows/subflows/pmf-research.json';
const GEMINI_SUBFLOW_PATH = '/files/workflows/subflows/pmf-gemini-stage.json';
const AIRTABLE_SUBFLOW_PATH = '/files/workflows/subflows/pmf-airtable-control-plane.json';

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createNode(name, type, typeVersion, position, parameters = {}, extra = {}) {
  return {
    parameters,
    id: randomUUID(),
    name,
    type,
    typeVersion,
    position,
    ...extra,
  };
}

function createWorkflow(name, nodes, connections, extra = {}) {
  return {
    name,
    nodes,
    connections,
    pinData: {},
    active: false,
    settings: {
      executionOrder: 'v1',
      callerPolicy: 'workflowsFromSameOwner',
      ...(extra.settings || {}),
    },
    versionId: randomUUID(),
    meta: {
      templateCredsSetupCompleted: false,
      ...(extra.meta || {}),
    },
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => !['settings', 'meta'].includes(key))),
  };
}

function connect(connections, from, to, output = 0, input = 0) {
  if (!connections[from]) connections[from] = { main: [] };
  if (!connections[from].main[output]) connections[from].main[output] = [];
  connections[from].main[output].push({ node: to, type: 'main', index: input });
}

function webhookNode(name, path, method) {
  return createNode(
    name,
    'n8n-nodes-base.webhook',
    2.1,
    [0, 0],
    {
      httpMethod: method,
      path,
      responseMode: 'responseNode',
      options: {},
    },
    { webhookId: randomUUID() },
  );
}

function responseNode(name, bodyExpression, responseCodeExpression) {
  return createNode(
    name,
    'n8n-nodes-base.respondToWebhook',
    1.5,
    [0, 0],
    {
      respondWith: 'json',
      responseBody: bodyExpression,
      options: {
        responseCode: responseCodeExpression,
      },
    },
  );
}

function postgresQueryNode(name, query, replacementsExpression, position) {
  return createNode(
    name,
    'n8n-nodes-base.postgres',
    2.6,
    position,
    {
      resource: 'database',
      operation: 'executeQuery',
      query,
      options: {
        queryBatching: 'single',
        queryReplacement: replacementsExpression,
        replaceEmptyStrings: true,
      },
    },
  );
}

function executeLocalWorkflowNode(name, workflowPath, position) {
  return createNode(
    name,
    'n8n-nodes-base.executeWorkflow',
    1.1,
    position,
    {
      source: 'localFile',
      workflowPath,
      mode: 'once',
      options: {
        waitForSubWorkflow: true,
      },
    },
  );
}

function ifNode(name, leftValueExpression, position) {
  return createNode(
    name,
    'n8n-nodes-base.if',
    2.2,
    position,
    {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: randomUUID(),
            leftValue: leftValueExpression,
            rightValue: '',
            operator: {
              type: 'boolean',
              operation: 'true',
              singleValue: true,
            },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
  );
}

function mergeCombineNode(name, position) {
  return createNode(
    name,
    'n8n-nodes-base.merge',
    3.2,
    position,
    {
      mode: 'combine',
      combineBy: 'combineByPosition',
      options: {},
    },
  );
}

function httpJsonNode(name, urlExpression, bodyExpression, position, timeout = 60000) {
  return createNode(
    name,
    'n8n-nodes-base.httpRequest',
    4.2,
    position,
    {
      method: 'POST',
      url: urlExpression,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Content-Type',
            value: 'application/json',
          },
          {
            name: 'x-goog-api-key',
            value: '={{ $env.GEMINI_API_KEY }}',
          },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: bodyExpression,
      options: {
        timeout,
      },
    },
    {
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
    },
  );
}

function exaNode(name, queryExpression, extraBody, position) {
  return createNode(
    name,
    'n8n-nodes-base.httpRequest',
    4.2,
    position,
    {
      method: 'POST',
      url: 'https://api.exa.ai/search',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Content-Type',
            value: 'application/json',
          },
          {
            name: 'x-api-key',
            value: '={{ $env.EXA_API_KEY }}',
          },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ ({ query: ${queryExpression}, numResults: 8, type: 'auto', contents: { text: { maxCharacters: 1200 } }, livecrawl: 'preferred', ...(${extraBody}) }) }}`,
      options: {
        timeout: 45000,
      },
    },
    {
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
    },
  );
}

function airtableRequestNode(name, position) {
  return createNode(
    name,
    'n8n-nodes-base.httpRequest',
    4.2,
    position,
    {
      method: '={{ $json.airtable_request.method }}',
      url: '={{ $json.airtable_request.url }}',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Content-Type',
            value: 'application/json',
          },
          {
            name: 'Authorization',
            value: '={{ "Bearer " + $env.AIRTABLE_TOKEN }}',
          },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ $json.airtable_request.body }}',
      options: {
        timeout: 45000,
      },
    },
    {
      continueOnFail: true,
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
    },
  );
}

function airtableLookupNode(name, position) {
  return createNode(
    name,
    'n8n-nodes-base.httpRequest',
    4.2,
    position,
    {
      method: 'GET',
      url: '={{ $json.airtable_request.url }}',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Authorization',
            value: '={{ "Bearer " + $env.AIRTABLE_TOKEN }}',
          },
        ],
      },
      options: {
        timeout: 45000,
      },
    },
    {
      continueOnFail: true,
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
    },
  );
}

function codeNode(name, jsCode, position) {
  return createNode(name, 'n8n-nodes-base.code', 2, position, { jsCode });
}

function stageLogQuery() {
  return `
WITH logs AS (
  SELECT *
  FROM jsonb_to_recordset($2::jsonb) AS l(
    stage_key text,
    attempt integer,
    status text,
    latency_ms integer,
    warning_details jsonb,
    raw_response jsonb,
    parsed_response jsonb,
    provider text,
    model text,
    schema_version text,
    config_source text,
    config_snapshot jsonb
  )
)
INSERT INTO pmf_stage_runs (
  run_id,
  n8n_execution_id,
  stage_key,
  attempt,
  status,
  latency_ms,
  warning_count,
  warning_details,
  raw_response,
  parsed_response,
  provider,
  model,
  schema_version,
  config_source,
  config_snapshot
)
SELECT
  $1::uuid,
  $3,
  logs.stage_key,
  logs.attempt,
  logs.status,
  logs.latency_ms,
  COALESCE(jsonb_array_length(COALESCE(logs.warning_details, '[]'::jsonb)), 0),
  COALESCE(logs.warning_details, '[]'::jsonb),
  logs.raw_response,
  logs.parsed_response,
  logs.provider,
  logs.model,
  logs.schema_version,
  logs.config_source,
  COALESCE(logs.config_snapshot, '{}'::jsonb)
FROM logs
ON CONFLICT (run_id, stage_key, attempt)
DO UPDATE SET
  n8n_execution_id = EXCLUDED.n8n_execution_id,
  status = EXCLUDED.status,
  latency_ms = EXCLUDED.latency_ms,
  warning_count = EXCLUDED.warning_count,
  warning_details = EXCLUDED.warning_details,
  raw_response = EXCLUDED.raw_response,
  parsed_response = EXCLUDED.parsed_response,
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  schema_version = EXCLUDED.schema_version,
  config_source = EXCLUDED.config_source,
  config_snapshot = EXCLUDED.config_snapshot;
`.trim();
}

function stageLogReplacementsExpression() {
  return '={{ [$json.run_id, JSON.stringify($json.stage_attempt_logs || []), $json.n8n_execution_id] }}';
}

function controlPlaneStateQuery() {
  return `
UPDATE pmf_runs
SET
  control_plane_state = $2::jsonb,
  updated_at = NOW()
WHERE run_id = $1::uuid
RETURNING run_id;
`.trim();
}

function finalRunQuery() {
  return `
UPDATE pmf_runs
SET
  status = $2::pmf_run_status,
  research_context = $3::jsonb,
  analysis_outputs = $4::jsonb,
  final_output = $5::jsonb,
  warnings = $6::jsonb,
  control_plane_state = $7::jsonb,
  updated_at = NOW(),
  completed_at = CASE
    WHEN $2::pmf_run_status IN ('completed', 'rejected', 'needs_changes', 'failed')
      THEN NOW()
    ELSE NULL
  END
WHERE run_id = $1::uuid
RETURNING run_id;
`.trim();
}

function gateDecisionUpsertQuery() {
  return `
INSERT INTO pmf_gate_decisions (
  run_id,
  external_key,
  gate_type,
  decision_status,
  review_reasons,
  operator_name,
  operator_notes,
  source,
  created_at,
  updated_at,
  decided_at
)
VALUES (
  $1::uuid,
  $2,
  $3,
  $4,
  $5::jsonb,
  $6,
  $7,
  $8,
  NOW(),
  NOW(),
  CASE
    WHEN $4 IN ('approved', 'rejected', 'needs_changes', 'auto_approved') THEN NOW()
    ELSE NULL
  END
)
ON CONFLICT (external_key)
DO UPDATE SET
  decision_status = EXCLUDED.decision_status,
  review_reasons = EXCLUDED.review_reasons,
  operator_name = EXCLUDED.operator_name,
  operator_notes = EXCLUDED.operator_notes,
  source = EXCLUDED.source,
  updated_at = NOW(),
  decided_at = CASE
    WHEN EXCLUDED.decision_status IN ('approved', 'rejected', 'needs_changes', 'auto_approved')
      THEN COALESCE(pmf_gate_decisions.decided_at, NOW())
    ELSE pmf_gate_decisions.decided_at
  END
RETURNING id;
`.trim();
}

function loadRunWithGateQuery() {
  return `
WITH target AS (
  SELECT
    to_jsonb(r.*) AS run,
    (
      SELECT to_jsonb(g.*)
      FROM pmf_gate_decisions g
      WHERE g.run_id = r.run_id
        AND g.gate_type = 'manual_review'
      LIMIT 1
    ) AS gate_decision
  FROM pmf_runs r
  WHERE r.run_id::text = $1
  LIMIT 1
)
SELECT run, gate_decision FROM target
UNION ALL
SELECT NULL::jsonb AS run, NULL::jsonb AS gate_decision
WHERE NOT EXISTS (SELECT 1 FROM target)
LIMIT 1;
`.trim();
}

function controlPlaneBootstrapSnippet(inputRef = 'input') {
  return `
const controlPlaneState = {
  ...(${inputRef}.control_plane_state || {}),
  airtable: {
    ...(${inputRef}.control_plane_state?.airtable || {}),
    enabled: String($env.AIRTABLE_CONTROL_PLANE_ENABLED || 'false').toLowerCase() === 'true',
    run_record_id: ${inputRef}.control_plane_state?.airtable?.run_record_id || null,
    last_action: ${inputRef}.control_plane_state?.airtable?.last_action || null,
    last_synced_at: ${inputRef}.control_plane_state?.airtable?.last_synced_at || null,
    last_error: ${inputRef}.control_plane_state?.airtable?.last_error || null,
    stage_attempt_syncs: ${inputRef}.control_plane_state?.airtable?.stage_attempt_syncs || 0,
    experiment_syncs: ${inputRef}.control_plane_state?.airtable?.experiment_syncs || 0,
    last_gate_record_id: ${inputRef}.control_plane_state?.airtable?.last_gate_record_id || null,
  },
};
`.trim();
}

function validateIntakeCode() {
  return `
const item = $input.first().json;
const body = item.body || {};
const required = ['idea', 'target_audience', 'monetization_guess'];
const sanitize = (value) =>
  String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();

const cleaned = {};
const missing = [];

for (const field of required) {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    missing.push(field);
  } else {
    cleaned[field] = sanitize(value);
  }
}

if (missing.length) {
  return [
    {
      json: {
        is_valid: false,
        http_status: 400,
        initial_response: {
          error: 'missing or invalid fields',
          required,
          missing,
        },
      },
    },
  ];
}

const runId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
  const random = Math.floor(Math.random() * 16);
  const value = char === 'x' ? random : ((random & 0x3) | 0x8);
  return value.toString(16);
});

return [
  {
    json: {
      ...cleaned,
      input_payload: cleaned,
      research_context: null,
      analysis_outputs: {},
      warnings: [],
      run_id: runId,
      n8n_execution_id: $execution.id,
      is_valid: true,
      http_status: 202,
      initial_response: {
        run_id: runId,
        status: 'accepted',
        status_url: '/webhook/pmf-brainstorm-status?run_id=' + runId,
      },
    },
  },
];
`.trim();
}

function restoreRunContextCode() {
  return `
return [
  {
    json: {
      ...$('Validate Intake').first().json,
    },
  },
];
`.trim();
}

function prepareAirtableRunSyncCode() {
  return `
const input = $input.first().json;
${controlPlaneBootstrapSnippet()}

return [
  {
    json: {
      ...input,
      control_plane_state: controlPlaneState,
      airtable_action: 'sync_run',
      status: input.status || 'running',
    },
  },
];
`.trim();
}

function prepareAirtableStageSyncCode() {
  return `
const input = $input.first().json;
${controlPlaneBootstrapSnippet()}

return [
  {
    json: {
      ...input,
      control_plane_state: controlPlaneState,
      airtable_action: 'sync_stage_attempts',
    },
  },
];
`.trim();
}

function prepareAirtableFinalSyncCode() {
  return `
const input = $input.first().json;
${controlPlaneBootstrapSnippet()}

return [
  {
    json: {
      ...input,
      control_plane_state: controlPlaneState,
      airtable_action: 'sync_final_run',
    },
  },
];
`.trim();
}

function prepareAirtableGateSyncCode() {
  return `
const input = $input.first().json;
${controlPlaneBootstrapSnippet()}
const reviewGate = input.review_gate || input.final_output?._metadata?.review_gate || null;

return [
  {
    json: {
      ...input,
      control_plane_state: controlPlaneState,
      review_gate: reviewGate,
      review_gate_record: input.review_gate_record || null,
      airtable_action: 'sync_gate_decision',
    },
  },
];
`.trim();
}

function prepareAirtableExperimentSyncCode() {
  return `
const input = $input.first().json;
${controlPlaneBootstrapSnippet()}
const experiments = Array.isArray(input.validation_planner_experiments)
  ? input.validation_planner_experiments
  : Array.isArray(input.analysis_outputs?.validation_planner?.experiments)
    ? input.analysis_outputs.validation_planner.experiments
    : [];

return [
  {
    json: {
      ...input,
      control_plane_state: controlPlaneState,
      validation_planner_experiments: experiments,
      airtable_action: 'sync_experiments',
    },
  },
];
`.trim();
}

function prepareAirtableFailureSyncCode() {
  return `
const input = $input.first().json;
${controlPlaneBootstrapSnippet()}

return [
  {
    json: {
      ...input,
      control_plane_state: controlPlaneState,
      airtable_action: 'sync_failure_run',
    },
  },
];
`.trim();
}

function prepareGateDecisionRecordCode() {
  return `
const input = $input.first().json;
const reviewGate = input.review_gate || input.final_output?._metadata?.review_gate || null;

if (!reviewGate || !reviewGate.required) {
  return [
    {
      json: {
        ...input,
        review_gate_record: null,
      },
    },
  ];
}

return [
  {
    json: {
      ...input,
      review_gate: reviewGate,
      review_gate_record: {
        external_key: input.run_id + ':manual_review',
        gate_type: 'manual_review',
        decision_status: reviewGate.status,
        reasons: reviewGate.reasons || [],
        operator_name: null,
        operator_notes: null,
        source: 'system',
      },
    },
  },
];
`.trim();
}

function reviewIntakeCode() {
  return `
const item = $input.first().json;
const body = item.body || {};
const decision = typeof body.decision === 'string' ? body.decision.trim().toLowerCase() : '';
const operator = typeof body.operator === 'string' ? body.operator.trim() : '';
const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
const runId = typeof body.run_id === 'string' ? body.run_id.trim() : '';
const allowed = ['approve', 'reject', 'needs_changes'];

if (!runId) {
  return [{ json: { is_valid: false, http_status: 400, response_body: { error: 'run_id is required' } } }];
}

if (!allowed.includes(decision)) {
  return [{ json: { is_valid: false, http_status: 400, response_body: { error: 'decision must be one of approve, reject, needs_changes', run_id: runId } } }];
}

if (!operator) {
  return [{ json: { is_valid: false, http_status: 400, response_body: { error: 'operator is required', run_id: runId } } }];
}

return [
  {
    json: {
      is_valid: true,
      run_id: runId,
      decision,
      operator,
      notes,
    },
  },
];
`.trim();
}

function prepareReviewDecisionCode() {
  return `
const input = $input.first().json;
const run = input.run;
const gateDecision = input.gate_decision;

if (!run) {
  return [{ json: { http_status: 404, response_body: { error: 'run not found', run_id: input.run_id } } }];
}

if (run.status !== 'awaiting_review') {
  return [
    {
      json: {
        http_status: 409,
        response_body: {
          error: 'run is not awaiting review',
          run_id: run.run_id,
          current_status: run.status,
        },
      },
    },
  ];
}

const decisionToStatus = {
  approve: 'completed',
  reject: 'rejected',
  needs_changes: 'needs_changes',
};

const decisionStatus = {
  approve: 'approved',
  reject: 'rejected',
  needs_changes: 'needs_changes',
};

const reasons = Array.isArray(gateDecision?.review_reasons)
  ? gateDecision.review_reasons
  : Array.isArray(run.control_plane_state?.review_gate?.reasons)
    ? run.control_plane_state.review_gate.reasons
    : [];
const reviewedAt = new Date().toISOString();
const reviewGate = {
  required: true,
  status: decisionStatus[input.decision],
  reasons,
  evaluated_at: run.control_plane_state?.review_gate?.evaluated_at || reviewedAt,
  reviewed_at: reviewedAt,
  operator: input.operator,
  operator_notes: input.notes || '',
};
const controlPlaneState = {
  ...(run.control_plane_state || {}),
  review_gate: reviewGate,
};
const updatedFinalOutput = run.final_output
  ? {
      ...run.final_output,
      _metadata: {
        ...(run.final_output._metadata || {}),
        review_gate: reviewGate,
        completed_at: reviewedAt,
      },
    }
  : null;

return [
  {
    json: {
      ...input,
      run_id: run.run_id,
      run,
      review_gate: reviewGate,
      control_plane_state: controlPlaneState,
      updated_final_output: updatedFinalOutput,
      final_status: decisionToStatus[input.decision],
      review_gate_record: {
        external_key: run.run_id + ':manual_review',
        gate_type: 'manual_review',
        decision_status: decisionStatus[input.decision],
        reasons,
        operator_name: input.operator,
        operator_notes: input.notes || '',
        source: 'operator',
      },
      response_body: {
        run_id: run.run_id,
        status: decisionToStatus[input.decision],
        review_gate: reviewGate,
      },
      http_status: 200,
    },
  },
];
`.trim();
}

function researchPrepareCode() {
  return `
const input = $input.first().json;

return [
  {
    json: {
      ...input,
      warnings: Array.isArray(input.warnings) ? input.warnings : [],
      analysis_outputs: input.analysis_outputs || {},
      research_started_at: Date.now(),
      research_queries: {
        competitors: input.idea + ' competitor OR alternative',
        pain_points: input.target_audience + ' pain points forum discussion ' + input.idea,
        trends: input.idea + ' market demand trend adoption',
      },
    },
  },
];
`.trim();
}

function normalizeSearchCode(kind) {
  return `
const results = Array.isArray($json.results) ? $json.results : [];
return [
  {
    json: {
      ${kind}_results: results.map((result) => ({
        title: result.title || null,
        url: result.url || result.id || null,
        text: result.text || null,
      })),
    },
  },
];
`.trim();
}

function normalizeResearchCode() {
  return `
const base = $('Prepare Queries').first().json;
const competitorResults = Array.isArray($json.competitor_results) ? $json.competitor_results : [];
const painPointResults = Array.isArray($json.pain_point_results) ? $json.pain_point_results : [];
const trendResults = Array.isArray($json.trend_results) ? $json.trend_results : [];

const sourceCounts = {
  competitors: competitorResults.length,
  pain_points: painPointResults.length,
  trends: trendResults.length,
};

if (sourceCounts.competitors + sourceCounts.pain_points + sourceCounts.trends === 0) {
  throw new Error('No usable Exa sources were returned for this run.');
}

const warnings = [...(Array.isArray(base.warnings) ? base.warnings : [])];

if (sourceCounts.competitors < 2) warnings.push('Competitor coverage is thin.');
if (sourceCounts.pain_points < 2) warnings.push('Pain-point coverage is thin.');
if (sourceCounts.trends < 2) warnings.push('Trend coverage is thin.');

const researchContext = {
  competitors: competitorResults,
  pain_points: painPointResults,
  trends: trendResults,
  source_counts: sourceCounts,
  partial: Object.values(sourceCounts).some((count) => count === 0),
};

return [
  {
    json: {
      ...base,
      warnings,
      research_context: researchContext,
      stage_attempt_logs: [
        {
          stage_key: 'research',
          attempt: 1,
          status: warnings.length ? 'completed_with_warnings' : 'success',
          latency_ms: Date.now() - base.research_started_at,
          warning_details: warnings,
          raw_response: {
            competitor_count: sourceCounts.competitors,
            pain_point_count: sourceCounts.pain_points,
            trend_count: sourceCounts.trends,
          },
          parsed_response: researchContext,
        },
      ],
    },
  },
];
`.trim();
}

function preparePromptCode() {
  return `
const input = $input.first().json;
const stage = input.stage_config;

if (!stage || !stage.key || !stage.schema) {
  throw new Error('Missing stage_config definition.');
}

const warnings = Array.isArray(input.warnings) ? [...input.warnings] : [];
let provider = typeof stage.provider === 'string' ? stage.provider.trim().toLowerCase() : 'gemini';

if (!provider) {
  provider = 'gemini';
}

if (provider !== 'gemini') {
  warnings.push('Stage ' + stage.key + ' requested unsupported provider "' + provider + '". Falling back to Gemini.');
  provider = 'gemini';
}

const model =
  typeof stage.model === 'string' && stage.model.trim()
    ? stage.model.trim()
    : ($env.GEMINI_MODEL || 'gemini-3-flash-preview');
const rawTemperature = Number(stage.temperature);
const baseTemperature = Number.isFinite(rawTemperature) ? Math.min(Math.max(rawTemperature, 0), 1) : 0.2;
const rawMaxAttempts = Number(stage.max_attempts);
const maxAttempts = Number.isInteger(rawMaxAttempts)
  ? Math.min(Math.max(rawMaxAttempts, 1), 3)
  : 3;
const retryTemperatures = [
  baseTemperature,
  Math.max(0, Number((baseTemperature - 0.1).toFixed(2))),
  Math.max(0, Number((baseTemperature - 0.15).toFixed(2))),
];
const configSnapshot = {
  key: stage.key,
  provider,
  model,
  schema_version: stage.schema_version || 'v1',
  temperature: baseTemperature,
  max_attempts: maxAttempts,
  config_source: stage.config_source || 'default',
  schema: stage.schema,
  required_keys: Array.isArray(stage.required_keys) ? stage.required_keys : [],
  fallback: stage.fallback || {},
  prompt_template: stage.instructions || '',
};

const promptSections = [
  stage.system || '',
  stage.instructions || '',
  'Return JSON only. Do not wrap the response in markdown fences.',
  'Context:',
  JSON.stringify(
    {
      idea: input.idea,
      target_audience: input.target_audience,
      monetization_guess: input.monetization_guess,
      research_context: input.research_context,
      analysis_outputs: input.analysis_outputs || {},
    },
    null,
    2,
  ),
];

return [
  {
    json: {
      ...input,
      warnings,
      stage_started_at: Date.now(),
      stage_provider: provider,
      stage_model: model,
      stage_temperature: baseTemperature,
      stage_retry_temperatures: retryTemperatures,
      stage_retry_limit: maxAttempts,
      stage_schema_version: stage.schema_version || 'v1',
      stage_config_source: stage.config_source || 'default',
      stage_config_snapshot: configSnapshot,
      stage_prompt: promptSections.filter(Boolean).join('\\n\\n'),
    },
  },
];
`.trim();
}

function parseAttemptCode(attempt, previousNodeName) {
  const previousLogsExpression =
    previousNodeName === null
      ? '[]'
      : `($('${previousNodeName}').first().json.stage_attempt_logs || [])`;

  return `
const base = $('Prepare Prompt').first().json;
const raw = $json.candidates?.[0]?.content?.parts?.[0]?.text || '';
let parsed = null;
let valid = false;
let errorMessage = null;

function validateAgainstSchema(value, schema, path = 'root') {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return [path + ' must be an object'];
    }

    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!(key in value)) {
        errors.push(path + '.' + key + ' is required');
      }
    }

    const properties = schema.properties || {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value) {
        errors.push(...validateAgainstSchema(value[key], childSchema, path + '.' + key));
      }
    }

    return errors;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      return [path + ' must be an array'];
    }

    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateAgainstSchema(item, schema.items, path + '[' + index + ']'));
      });
    }

    return errors;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      return [path + ' must be a string'];
    }

    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      return [path + ' must be one of: ' + schema.enum.join(', ')];
    }

    return errors;
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return [path + ' must be a number'];
    }

    return errors;
  }

  if (schema.type === 'integer') {
    if (!Number.isInteger(value)) {
      return [path + ' must be an integer'];
    }

    return errors;
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return [path + ' must be a boolean'];
    }

    return errors;
  }

  return errors;
}

try {
  if (!raw) {
    throw new Error('Gemini returned an empty response.');
  }

  parsed = JSON.parse(raw);

  const validationErrors = validateAgainstSchema(parsed, base.stage_config.schema);
  const required = Array.isArray(base.stage_config.required_keys)
    ? base.stage_config.required_keys
    : [];
  const missing = required.filter((key) => !(key in parsed));

  if (missing.length) {
    validationErrors.push('Missing keys: ' + missing.join(', '));
  }

  if (validationErrors.length) {
    throw new Error(validationErrors.join(' | '));
  }

  valid = true;
} catch (error) {
  errorMessage = error.message;
}

const currentLog = {
  stage_key: base.stage_config.key,
  attempt: ${attempt},
  status: valid
    ? 'success'
    : (${attempt} >= (base.stage_retry_limit || 3) ? 'fallback' : 'retry'),
  latency_ms: Date.now() - base.stage_started_at,
  warning_details: errorMessage ? [errorMessage] : [],
  raw_response: raw ? { text: raw } : null,
  parsed_response: parsed,
  provider: base.stage_provider,
  model: base.stage_model,
  schema_version: base.stage_schema_version,
  config_source: base.stage_config_source,
  config_snapshot: base.stage_config_snapshot,
};

return [
  {
    json: {
      ...base,
      llm_valid: valid,
      stage_attempt: ${attempt},
      stage_attempt_error: errorMessage,
      llm_raw: raw,
      llm_parsed: parsed,
      stage_attempt_logs: [...${previousLogsExpression}, currentLog],
    },
  },
];
`.trim();
}

function commitStageCode() {
  return `
const item = $input.first().json;
const stageKey = item.stage_config.key;
const analysisOutputs = { ...(item.analysis_outputs || {}) };

analysisOutputs[stageKey] = {
  ...item.llm_parsed,
  incomplete: false,
  _config: {
    provider: item.stage_provider,
    model: item.stage_model,
    schema_version: item.stage_schema_version,
    source: item.stage_config_source,
  },
};

return [
  {
    json: {
      ...item,
      analysis_outputs: analysisOutputs,
    },
  },
];
`.trim();
}

function fallbackStageCode() {
  return `
const item = $input.first().json;
const stageKey = item.stage_config.key;
const analysisOutputs = { ...(item.analysis_outputs || {}) };
const warnings = [...(Array.isArray(item.warnings) ? item.warnings : [])];

warnings.push('Stage ' + stageKey + ' exhausted retries and used fallback output.');

analysisOutputs[stageKey] = {
  ...(item.stage_config.fallback || {}),
  incomplete: true,
  error: item.stage_attempt_error,
  _config: {
    provider: item.stage_provider,
    model: item.stage_model,
    schema_version: item.stage_schema_version,
    source: item.stage_config_source,
  },
};

return [
  {
    json: {
      ...item,
      warnings,
      analysis_outputs: analysisOutputs,
    },
  },
];
`.trim();
}

function stageConfigCode(stage) {
  return `
const input = $input.first().json;
${controlPlaneBootstrapSnippet()}

return [
  {
    json: {
      ...input,
      control_plane_state: controlPlaneState,
      stage_config: ${JSON.stringify(stage, null, 2)},
      default_stage_config: ${JSON.stringify(stage, null, 2)},
      airtable_action: 'load_prompt_config',
    },
  },
];
`.trim();
}

function finalizeCode() {
  return `
const item = $input.first().json;
const synthesis = item.analysis_outputs?.synthesis;

if (!synthesis) {
  throw new Error('Missing synthesis output.');
}

const bands = {
  'strong fit': [75, 100],
  'worth validating': [50, 74],
  'weak fit': [30, 49],
  'pivot recommended': [0, 29],
};

if (!(synthesis.verdict in bands)) {
  throw new Error('Invalid verdict: ' + synthesis.verdict);
}

if (typeof synthesis.overall_score !== 'number' || Number.isNaN(synthesis.overall_score)) {
  throw new Error('overall_score must be numeric.');
}

const [minScore, maxScore] = bands[synthesis.verdict];
if (synthesis.overall_score < minScore || synthesis.overall_score > maxScore) {
  throw new Error('overall_score does not match the selected verdict band.');
}

const stageIncomplete = Object.values(item.analysis_outputs || {}).some(
  (value) => value && value.incomplete,
);
const reviewReasons = [];

if (stageIncomplete) {
  reviewReasons.push('One or more LLM stages exhausted retries and used fallback output.');
}

if (Array.isArray(item.warnings) && item.warnings.length) {
  reviewReasons.push('Workflow accumulated warnings that require operator review.');
}

if (synthesis.overall_score < 55) {
  reviewReasons.push('Overall score is below the auto-approve threshold.');
}

if (typeof item.analysis_outputs?.risk_assessor?.moat_score === 'number' && item.analysis_outputs.risk_assessor.moat_score < 35) {
  reviewReasons.push('Moat score is below the auto-approve threshold.');
}

const reviewGate = {
  required: reviewReasons.length > 0,
  status: reviewReasons.length > 0 ? 'pending_manual_review' : 'auto_approved',
  reasons: reviewReasons,
  evaluated_at: new Date().toISOString(),
};

const finalStatus = reviewGate.required ? 'awaiting_review' : 'completed';

const finalOutput = {
  run_id: item.run_id,
  overall_score: synthesis.overall_score,
  verdict: synthesis.verdict,
  one_line_summary: synthesis.one_line_summary,
  top_strength: synthesis.top_strength,
  top_risk: synthesis.top_risk,
  recommended_first_action: synthesis.recommended_first_action,
  market_scanner: item.analysis_outputs.market_scanner,
  persona_builder: item.analysis_outputs.persona_builder,
  risk_assessor: item.analysis_outputs.risk_assessor,
  validation_planner: item.analysis_outputs.validation_planner,
  synthesis,
  _metadata: {
    n8n_execution_id: item.n8n_execution_id,
    sources_fetched: item.research_context?.source_counts || {},
    warnings: item.warnings || [],
    stage_incomplete: stageIncomplete,
    review_gate: reviewGate,
    completed_at: reviewGate.required ? null : new Date().toISOString(),
  },
};

const controlPlaneState = {
  ...(item.control_plane_state || {}),
  review_gate: reviewGate,
};

return [
  {
    json: {
      ...item,
      final_status: finalStatus,
      control_plane_state: controlPlaneState,
      review_gate: reviewGate,
      validation_planner_experiments: item.analysis_outputs?.validation_planner?.experiments || [],
      final_output: finalOutput,
    },
  },
];
`.trim();
}

function prepareAirtableRequestCode() {
  return `
const input = $input.first().json;
const enabled = String($env.AIRTABLE_CONTROL_PLANE_ENABLED || 'false').toLowerCase() === 'true';
const token = ($env.AIRTABLE_TOKEN || '').trim();
const baseId = ($env.AIRTABLE_BASE_ID || '').trim();
const tableNames = {
  runs: ($env.AIRTABLE_RUNS_TABLE || 'Runs').trim(),
  stageAttempts: ($env.AIRTABLE_STAGE_ATTEMPTS_TABLE || 'Stage Attempts').trim(),
  gateDecisions: ($env.AIRTABLE_GATE_DECISIONS_TABLE || 'Gate Decisions').trim(),
  experiments: ($env.AIRTABLE_EXPERIMENTS_TABLE || 'Experiments').trim(),
  promptConfigs: ($env.AIRTABLE_PROMPT_CONFIGS_TABLE || 'Prompt Configs').trim(),
};
const warnings = [...(Array.isArray(input.warnings) ? input.warnings : [])];
const controlPlaneState = {
  ...(input.control_plane_state || {}),
  airtable: {
    ...((input.control_plane_state || {}).airtable || {}),
    enabled,
  },
};

const buildUrl = (table, recordId = null) => {
  const encodedBase = encodeURIComponent(baseId);
  const encodedTable = encodeURIComponent(table);
  return recordId
    ? 'https://api.airtable.com/v0/' + encodedBase + '/' + encodedTable + '/' + encodeURIComponent(recordId)
    : 'https://api.airtable.com/v0/' + encodedBase + '/' + encodedTable;
};

const normalizeStageConfig = (stage, source = 'default') => {
  if (!stage || typeof stage !== 'object') {
    return null;
  }

  const maxAttempts = Number(stage.max_attempts);
  const temperature = Number(stage.temperature);

  return {
    ...stage,
    provider: typeof stage.provider === 'string' && stage.provider.trim()
      ? stage.provider.trim().toLowerCase()
      : 'gemini',
    model: typeof stage.model === 'string' ? stage.model.trim() : '',
    max_attempts: Number.isInteger(maxAttempts)
      ? Math.min(Math.max(maxAttempts, 1), 3)
      : 3,
    temperature: Number.isFinite(temperature)
      ? Math.min(Math.max(temperature, 0), 1)
      : 0.2,
    schema_version: stage.schema_version || 'v1',
    config_source: source,
  };
};

const slugify = (value) =>
  String(value || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'item';

let airtableRequest = null;
let airtableShouldCall = false;
let airtableSkipReason = null;
let airtableRequestKind = 'write';
let stageConfig = normalizeStageConfig(input.stage_config, input.stage_config?.config_source || 'default');

if (!enabled) {
  airtableSkipReason = 'disabled';
  if (input.airtable_action === 'load_prompt_config') {
    stageConfig = normalizeStageConfig(input.default_stage_config || input.stage_config, 'default');
  }
} else if (!token || token === 'replace-me' || !baseId || baseId === 'replace-me') {
  airtableSkipReason = 'missing_credentials';
  warnings.push('Airtable control plane is enabled but AIRTABLE_TOKEN or AIRTABLE_BASE_ID is missing.');
  controlPlaneState.airtable.last_error = 'missing_credentials';
  if (input.airtable_action === 'load_prompt_config') {
    stageConfig = normalizeStageConfig(input.default_stage_config || input.stage_config, 'default');
  }
} else {
  switch (input.airtable_action) {
    case 'load_prompt_config': {
      const stageKey = input.default_stage_config?.key || input.stage_config?.key;
      if (!stageKey) {
        airtableSkipReason = 'missing_stage_key';
        stageConfig = normalizeStageConfig(input.default_stage_config || input.stage_config, 'default');
        break;
      }

      airtableShouldCall = true;
      airtableRequestKind = 'config_lookup';
      stageConfig = normalizeStageConfig(input.default_stage_config || input.stage_config, 'default');
      airtableRequest = {
        method: 'GET',
        url:
          buildUrl(tableNames.promptConfigs) +
          '?maxRecords=1&filterByFormula=' +
          encodeURIComponent(
            'AND({Stage Key}="' + String(stageKey).replace(/"/g, '\\"') + '",{Enabled}=TRUE())',
          ),
      };
      break;
    }
    case 'sync_run': {
      airtableShouldCall = true;
      airtableRequestKind = 'write';
      airtableRequest = {
        method: 'PATCH',
        url: buildUrl(tableNames.runs),
        body: {
          typecast: true,
          performUpsert: {
            fieldsToMergeOn: ['Run ID'],
          },
          records: [
            {
              fields: {
                'Run ID': input.run_id,
                'Status': input.status || 'running',
                'N8N Execution ID': input.n8n_execution_id,
                'Idea': input.idea,
                'Target Audience': input.target_audience,
                'Monetization Guess': input.monetization_guess,
                'Warnings JSON': JSON.stringify(warnings),
                'Control Plane State JSON': JSON.stringify(controlPlaneState),
                'Created At': new Date().toISOString(),
              },
            },
          ],
        },
      };
      break;
    }
    case 'sync_stage_attempts': {
      const logs = Array.isArray(input.stage_attempt_logs) ? input.stage_attempt_logs : [];
      if (!logs.length) {
        airtableSkipReason = 'no_stage_attempts';
        break;
      }

      airtableShouldCall = true;
      airtableRequestKind = 'write';
      airtableRequest = {
        method: 'PATCH',
        url: buildUrl(tableNames.stageAttempts),
        body: {
          typecast: true,
          performUpsert: {
            fieldsToMergeOn: ['External Key'],
          },
          records: logs.map((log) => ({
            fields: {
              'External Key': [input.run_id, log.stage_key, log.attempt].join(':'),
              'Run ID': input.run_id,
              ...(controlPlaneState.airtable.run_record_id
                ? { Run: [controlPlaneState.airtable.run_record_id] }
                : {}),
              'N8N Execution ID': input.n8n_execution_id,
              'Stage Key': log.stage_key,
              'Attempt': log.attempt,
              'Status': log.status,
              'Latency MS': log.latency_ms ?? null,
              'Warning Count': Array.isArray(log.warning_details) ? log.warning_details.length : 0,
              'Warning Summary': Array.isArray(log.warning_details) ? log.warning_details.join(' | ') : '',
              'Warning Details JSON': JSON.stringify(log.warning_details || []),
              'Raw Response JSON': JSON.stringify(log.raw_response || null),
              'Parsed Response JSON': JSON.stringify(log.parsed_response || null),
              'Provider': log.provider || '',
              'Model': log.model || '',
              'Schema Version': log.schema_version || '',
              'Config Source': log.config_source || '',
              'Config Snapshot JSON': JSON.stringify(log.config_snapshot || {}),
              'Created At': new Date().toISOString(),
            },
          })),
        },
      };
      break;
    }
    case 'sync_final_run': {
      airtableShouldCall = true;
      airtableRequestKind = 'write';
      airtableRequest = {
        method: 'PATCH',
        url: buildUrl(tableNames.runs),
        body: {
          typecast: true,
          performUpsert: {
            fieldsToMergeOn: ['Run ID'],
          },
          records: [
            {
              fields: {
                'Run ID': input.run_id,
                'Status': input.final_status,
                'N8N Execution ID': input.n8n_execution_id,
                'Idea': input.idea,
                'Target Audience': input.target_audience,
                'Monetization Guess': input.monetization_guess,
                'Verdict': input.final_output?.verdict || null,
                'Overall Score': input.final_output?.overall_score ?? null,
                'One-line Summary': input.final_output?.one_line_summary || null,
                'Top Strength': input.final_output?.top_strength || null,
                'Top Risk': input.final_output?.top_risk || null,
                'Warnings JSON': JSON.stringify(warnings),
                'Control Plane State JSON': JSON.stringify(controlPlaneState),
                'Review Gate Status': input.review_gate?.status || 'not_evaluated',
                'Review Reasons JSON': JSON.stringify(input.review_gate?.reasons || []),
                'Completed At': input.final_output?._metadata?.completed_at || null,
              },
            },
          ],
        },
      };
      break;
    }
    case 'sync_gate_decision': {
      const reviewGateRecord = input.review_gate_record;
      if (!reviewGateRecord) {
        airtableSkipReason = 'no_gate_required';
        break;
      }

      airtableShouldCall = true;
      airtableRequestKind = 'write';
      airtableRequest = {
        method: 'PATCH',
        url: buildUrl(tableNames.gateDecisions),
        body: {
          typecast: true,
          performUpsert: {
            fieldsToMergeOn: ['External Key'],
          },
          records: [
            {
              fields: {
                'External Key': reviewGateRecord.external_key,
                'Run ID': input.run_id,
                ...(controlPlaneState.airtable.run_record_id
                  ? { Run: [controlPlaneState.airtable.run_record_id] }
                  : {}),
                'Gate Type': reviewGateRecord.gate_type || 'manual_review',
                'Decision Status': reviewGateRecord.decision_status,
                'Reason Summary': Array.isArray(reviewGateRecord.reasons) ? reviewGateRecord.reasons.join(' | ') : '',
                'Reason Details JSON': JSON.stringify(reviewGateRecord.reasons || []),
                'Operator': reviewGateRecord.operator_name || '',
                'Operator Notes': reviewGateRecord.operator_notes || '',
                'Source': reviewGateRecord.source || 'system',
                'Created At': input.review_gate?.evaluated_at || new Date().toISOString(),
                'Decided At': input.review_gate?.reviewed_at || null,
              },
            },
          ],
        },
      };
      break;
    }
    case 'sync_experiments': {
      const experiments = Array.isArray(input.validation_planner_experiments)
        ? input.validation_planner_experiments
        : [];
      if (!experiments.length) {
        airtableSkipReason = 'no_experiments';
        break;
      }

      airtableShouldCall = true;
      airtableRequestKind = 'write';
      airtableRequest = {
        method: 'PATCH',
        url: buildUrl(tableNames.experiments),
        body: {
          typecast: true,
          performUpsert: {
            fieldsToMergeOn: ['External Key'],
          },
          records: experiments.map((experiment, index) => ({
            fields: {
              'External Key': input.run_id + ':experiment:' + index + ':' + slugify(experiment.name || 'untitled'),
              'Run ID': input.run_id,
              ...(controlPlaneState.airtable.run_record_id
                ? { Run: [controlPlaneState.airtable.run_record_id] }
                : {}),
              'Name': experiment.name || 'Untitled experiment',
              'Description': experiment.description || '',
              'Cost Estimate': experiment.cost_estimate || '',
              'Time Estimate': experiment.time_estimate || '',
              'Success Metric': experiment.success_metric || '',
              'Status': 'queued',
              'Created At': new Date().toISOString(),
            },
          })),
        },
      };
      break;
    }
    case 'sync_failure_run': {
      airtableShouldCall = true;
      airtableRequestKind = 'write';
      airtableRequest = {
        method: 'PATCH',
        url: buildUrl(tableNames.runs),
        body: {
          typecast: true,
          performUpsert: {
            fieldsToMergeOn: ['Run ID'],
          },
          records: [
            {
              fields: {
                'Run ID': input.run_id,
                'Status': 'failed',
                'Warnings JSON': JSON.stringify(warnings),
                'Review Gate Status': 'workflow_failed',
                'Error Summary JSON': JSON.stringify(input.error_summary || null),
                'Completed At': new Date().toISOString(),
              },
            },
          ],
        },
      };
      break;
    }
    default: {
      airtableSkipReason = 'unsupported_action';
      break;
    }
  }
}

return [
  {
    json: {
      ...input,
      warnings,
      control_plane_state: controlPlaneState,
      stage_config: stageConfig,
      airtable_request: airtableRequest,
      airtable_should_call: airtableShouldCall,
      airtable_skip_reason: airtableSkipReason,
      airtable_request_kind: airtableRequestKind,
    },
  },
];
`.trim();
}

function normalizeAirtableResponseCode() {
  return `
const base = $('Prepare Airtable Request').first().json;
const response = $input.first().json;
const warnings = [...(Array.isArray(base.warnings) ? base.warnings : [])];
const controlPlaneState = {
  ...(base.control_plane_state || {}),
  airtable: {
    ...((base.control_plane_state || {}).airtable || {}),
    last_action: base.airtable_action,
    last_synced_at: new Date().toISOString(),
  },
};

const normalizeStageConfig = (stage, source = 'default') => {
  if (!stage || typeof stage !== 'object') {
    return null;
  }

  const maxAttempts = Number(stage.max_attempts);
  const temperature = Number(stage.temperature);

  return {
    ...stage,
    provider: typeof stage.provider === 'string' && stage.provider.trim()
      ? stage.provider.trim().toLowerCase()
      : 'gemini',
    model: typeof stage.model === 'string' ? stage.model.trim() : '',
    max_attempts: Number.isInteger(maxAttempts)
      ? Math.min(Math.max(maxAttempts, 1), 3)
      : 3,
    temperature: Number.isFinite(temperature)
      ? Math.min(Math.max(temperature, 0), 1)
      : 0.2,
    schema_version: stage.schema_version || 'v1',
    config_source: source,
  };
};

const parseJsonField = (value, fallback) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

let stageConfig = base.stage_config || null;

if (response.error) {
  const message =
    response.error.message ||
    response.message ||
    'Unknown Airtable sync failure';

  warnings.push('Airtable ' + base.airtable_action + ' sync failed: ' + message);
  controlPlaneState.airtable.last_error = message;
} else {
  controlPlaneState.airtable.last_error = null;

  if (base.airtable_action === 'load_prompt_config') {
    const record = response.records?.[0] || null;
    const fields = record?.fields || null;
    const defaultStageConfig = normalizeStageConfig(base.default_stage_config || base.stage_config, 'default');

    if (!fields) {
      stageConfig = defaultStageConfig;
      warnings.push('No active Airtable prompt config found for stage ' + (defaultStageConfig?.key || 'unknown') + '. Using default stage config.');
    } else {
      const merged = {
        ...defaultStageConfig,
        instructions: typeof fields['Prompt Template'] === 'string' && fields['Prompt Template'].trim()
          ? fields['Prompt Template'].trim()
          : defaultStageConfig.instructions,
        schema: parseJsonField(fields['Schema JSON'], defaultStageConfig.schema),
        fallback: parseJsonField(fields['Fallback JSON'], defaultStageConfig.fallback),
        required_keys: parseJsonField(fields['Required Keys JSON'], defaultStageConfig.required_keys),
        provider: typeof fields.Provider === 'string' && fields.Provider.trim()
          ? fields.Provider.trim().toLowerCase()
          : defaultStageConfig.provider,
        model: typeof fields.Model === 'string' ? fields.Model.trim() : defaultStageConfig.model,
        temperature: fields.Temperature ?? defaultStageConfig.temperature,
        max_attempts: fields['Max Attempts'] ?? defaultStageConfig.max_attempts,
        schema_version: fields['Schema Version'] || defaultStageConfig.schema_version,
        config_source: 'airtable',
      };
      stageConfig = normalizeStageConfig(merged, 'airtable');
      controlPlaneState.airtable.last_prompt_config_record_id = record.id || null;
    }
  }

  if (base.airtable_action === 'sync_run') {
    const recordId = response.records?.[0]?.id || response.id || null;
    if (recordId) {
      controlPlaneState.airtable.run_record_id = recordId;
    }
  }

  if (base.airtable_action === 'sync_stage_attempts') {
    controlPlaneState.airtable.stage_attempt_syncs =
      (controlPlaneState.airtable.stage_attempt_syncs || 0) +
      (Array.isArray(response.records) ? response.records.length : 0);
  }

  if (base.airtable_action === 'sync_experiments') {
    controlPlaneState.airtable.experiment_syncs =
      (controlPlaneState.airtable.experiment_syncs || 0) +
      (Array.isArray(response.records) ? response.records.length : 0);
  }

  if (base.airtable_action === 'sync_gate_decision') {
    controlPlaneState.airtable.last_gate_record_id = response.records?.[0]?.id || null;
  }
}

return [
  {
    json: {
      ...base,
      warnings,
      control_plane_state: controlPlaneState,
      stage_config: stageConfig,
      airtable_response: response,
    },
  },
];
`.trim();
}

function skipAirtableSyncCode() {
  return `
const input = $input.first().json;
const stageConfig =
  input.airtable_action === 'load_prompt_config'
    ? {
        ...((input.default_stage_config || input.stage_config || {})),
        config_source: 'default',
      }
    : input.stage_config;
return [
  {
    json: {
      ...input,
      stage_config: stageConfig,
      airtable_response: {
        skipped: true,
        reason: input.airtable_skip_reason || 'skipped',
      },
    },
  },
];
`.trim();
}

function restoreNodeContextCode(sourceNodeName) {
  return `
const source = $(${JSON.stringify(sourceNodeName)}).first().json;

return [
  {
    json: {
      ...source,
    },
  },
];
`.trim();
}

function mergeNodeContextCode(sourceNodeName) {
  return `
const source = $(${JSON.stringify(sourceNodeName)}).first().json;
const current = $input.first().json;

return [
  {
    json: {
      ...source,
      ...current,
    },
  },
];
`.trim();
}

const marketStage = {
  key: 'market_scanner',
  provider: 'gemini',
  model: '',
  temperature: 0.2,
  max_attempts: 3,
  schema_version: 'v1',
  required_keys: ['competitors', 'market_saturation_score', 'market_summary'],
  system:
    'You are a market analyst. Use only the provided research context. Do not invent companies or pricing.',
  instructions:
    'Identify notable competitors, explain market saturation, and summarize the whitespace for this idea.',
  schema: {
    type: 'object',
    properties: {
      competitors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            url: { type: 'string' },
            pricing_model: { type: 'string' },
            key_features: { type: 'array', items: { type: 'string' } },
            gap_vs_idea: { type: 'string' },
          },
          required: ['name', 'gap_vs_idea'],
        },
      },
      market_saturation_score: { type: 'number' },
      market_summary: { type: 'string' },
    },
    required: ['competitors', 'market_saturation_score', 'market_summary'],
  },
  fallback: {
    competitors: [],
    market_saturation_score: 50,
    market_summary: 'Fallback output used because Gemini did not return valid market analysis.',
  },
};

const personaStage = {
  key: 'persona_builder',
  provider: 'gemini',
  model: '',
  temperature: 0.2,
  max_attempts: 3,
  schema_version: 'v1',
  required_keys: ['personas', 'audience_summary'],
  system:
    'You are a product researcher extracting personas from observed pain-point evidence only.',
  instructions:
    'Produce three distinct personas grounded in the pain-point research. Include JTBD language and willingness to pay.',
  schema: {
    type: 'object',
    properties: {
      personas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age_range: { type: 'string' },
            frustration: { type: 'string' },
            job_to_be_done: { type: 'string' },
            willingness_to_pay: { type: 'string' },
          },
          required: ['name', 'frustration', 'job_to_be_done'],
        },
      },
      audience_summary: { type: 'string' },
    },
    required: ['personas', 'audience_summary'],
  },
  fallback: {
    personas: [],
    audience_summary: 'Fallback output used because Gemini did not return valid persona analysis.',
  },
};

const riskStage = {
  key: 'risk_assessor',
  provider: 'gemini',
  model: '',
  temperature: 0.2,
  max_attempts: 3,
  schema_version: 'v1',
  required_keys: ['objections', 'regulatory_flags', 'moat_score', 'moat_reasoning'],
  system:
    'You are a skeptical product strategist focused on downside risk and defensibility.',
  instructions:
    'Identify likely objections, regulatory flags, and the moat quality of the proposed product.',
  schema: {
    type: 'object',
    properties: {
      objections: {
        type: 'array',
        items: { type: 'string' },
      },
      regulatory_flags: {
        type: 'array',
        items: { type: 'string' },
      },
      moat_score: { type: 'number' },
      moat_reasoning: { type: 'string' },
    },
    required: ['objections', 'regulatory_flags', 'moat_score', 'moat_reasoning'],
  },
  fallback: {
    objections: ['Fallback output used because Gemini did not return valid risk analysis.'],
    regulatory_flags: [],
    moat_score: 40,
    moat_reasoning: 'Fallback output used because Gemini did not return valid risk analysis.',
  },
};

const validationStage = {
  key: 'validation_planner',
  provider: 'gemini',
  model: '',
  temperature: 0.2,
  max_attempts: 3,
  schema_version: 'v1',
  required_keys: ['experiments', 'validation_summary'],
  system:
    'You design cheap, testable experiments for early-stage products.',
  instructions:
    'Suggest three low-cost validation experiments with clear cost, time, and success metrics.',
  schema: {
    type: 'object',
    properties: {
      experiments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            cost_estimate: { type: 'string' },
            time_estimate: { type: 'string' },
            success_metric: { type: 'string' },
          },
          required: ['name', 'description', 'success_metric'],
        },
      },
      validation_summary: { type: 'string' },
    },
    required: ['experiments', 'validation_summary'],
  },
  fallback: {
    experiments: [],
    validation_summary: 'Fallback output used because Gemini did not return valid validation experiments.',
  },
};

const synthesisStage = {
  key: 'synthesis',
  provider: 'gemini',
  model: '',
  temperature: 0.15,
  max_attempts: 3,
  schema_version: 'v1',
  required_keys: [
    'overall_score',
    'verdict',
    'one_line_summary',
    'top_strength',
    'top_risk',
    'recommended_first_action',
  ],
  system:
    'You are the synthesis layer. Produce the final PMF scorecard from the provided stage outputs only.',
  instructions:
    'Choose one verdict from: strong fit, worth validating, weak fit, pivot recommended. Keep the score consistent with the verdict band.',
  schema: {
    type: 'object',
    properties: {
      overall_score: { type: 'number' },
      verdict: {
        type: 'string',
        enum: ['strong fit', 'worth validating', 'weak fit', 'pivot recommended'],
      },
      one_line_summary: { type: 'string' },
      top_strength: { type: 'string' },
      top_risk: { type: 'string' },
      recommended_first_action: { type: 'string' },
    },
    required: [
      'overall_score',
      'verdict',
      'one_line_summary',
      'top_strength',
      'top_risk',
      'recommended_first_action',
    ],
  },
  fallback: {
    overall_score: 40,
    verdict: 'weak fit',
    one_line_summary: 'Fallback output used because Gemini did not return a valid synthesis.',
    top_strength: 'Insufficient model output to determine.',
    top_risk: 'Insufficient model output to determine.',
    recommended_first_action: 'Review stage outputs manually before acting.',
  },
};

function buildResearchSubflow() {
  const nodes = [];
  const connections = {};

  const trigger = createNode(
    'When Executed by Another Workflow',
    'n8n-nodes-base.executeWorkflowTrigger',
    1.1,
    [0, 0],
    {
      inputSource: 'passthrough',
    },
  );
  const prepareQueries = codeNode('Prepare Queries', researchPrepareCode(), [240, 0]);
  const competitorSearch = exaNode(
    'Exa Competitor Search',
    '$json.research_queries.competitors',
    '({})',
    [520, -180],
  );
  const painSearch = exaNode(
    'Exa Pain Point Search',
    '$json.research_queries.pain_points',
    `({ includeDomains: ['reddit.com', 'news.ycombinator.com', 'indiehackers.com'] })`,
    [520, 0],
  );
  const trendSearch = exaNode(
    'Exa Trend Search',
    '$json.research_queries.trends',
    '({})',
    [520, 180],
  );
  const normalizeCompetitors = codeNode(
    'Normalize Competitor Search',
    normalizeSearchCode('competitor'),
    [780, -180],
  );
  const normalizePain = codeNode(
    'Normalize Pain Point Search',
    normalizeSearchCode('pain_point'),
    [780, 0],
  );
  const normalizeTrends = codeNode(
    'Normalize Trend Search',
    normalizeSearchCode('trend'),
    [780, 180],
  );
  const mergeOne = mergeCombineNode('Merge Research Pair One', [1020, -60]);
  const mergeTwo = mergeCombineNode('Merge Research Pair Two', [1260, 60]);
  const finalizeResearch = codeNode('Normalize Research', normalizeResearchCode(), [1500, 60]);

  nodes.push(
    trigger,
    prepareQueries,
    competitorSearch,
    painSearch,
    trendSearch,
    normalizeCompetitors,
    normalizePain,
    normalizeTrends,
    mergeOne,
    mergeTwo,
    finalizeResearch,
  );

  connect(connections, trigger.name, prepareQueries.name);
  connect(connections, prepareQueries.name, competitorSearch.name);
  connect(connections, prepareQueries.name, painSearch.name);
  connect(connections, prepareQueries.name, trendSearch.name);
  connect(connections, competitorSearch.name, normalizeCompetitors.name);
  connect(connections, painSearch.name, normalizePain.name);
  connect(connections, trendSearch.name, normalizeTrends.name);
  connect(connections, normalizeCompetitors.name, mergeOne.name, 0, 0);
  connect(connections, normalizePain.name, mergeOne.name, 0, 1);
  connect(connections, mergeOne.name, mergeTwo.name, 0, 0);
  connect(connections, normalizeTrends.name, mergeTwo.name, 0, 1);
  connect(connections, mergeTwo.name, finalizeResearch.name);

  return createWorkflow('PMF Research Subflow', nodes, connections);
}

function buildGeminiSubflow() {
  const nodes = [];
  const connections = {};

  const trigger = createNode(
    'When Executed by Another Workflow',
    'n8n-nodes-base.executeWorkflowTrigger',
    1.1,
    [0, 0],
    {
      inputSource: 'passthrough',
    },
  );
  const preparePrompt = codeNode('Prepare Prompt', preparePromptCode(), [240, 0]);

  const attempt1 = httpJsonNode(
    'Gemini Attempt 1',
    '={{ "https://generativelanguage.googleapis.com/v1beta/models/" + ($json.stage_model || $env.GEMINI_MODEL || "gemini-3-flash-preview") + ":generateContent" }}',
    '={{ ({ contents: [{ parts: [{ text: $json.stage_prompt }] }], generationConfig: { temperature: $json.stage_retry_temperatures[0], responseMimeType: "application/json", responseJsonSchema: $json.stage_config.schema } }) }}',
    [520, -220],
    90000,
  );
  const parse1 = codeNode('Parse Attempt 1', parseAttemptCode(1, null), [760, -220]);
  const if1 = ifNode('Attempt 1 Valid?', '={{ $json.llm_valid }}', [980, -220]);
  const retryGate2 = ifNode('Retry Attempt 2 Allowed?', '={{ ($json.stage_retry_limit || 3) > 1 }}', [1220, -220]);

  const attempt2 = httpJsonNode(
    'Gemini Attempt 2',
    '={{ "https://generativelanguage.googleapis.com/v1beta/models/" + ($("Prepare Prompt").first().json.stage_model || $env.GEMINI_MODEL || "gemini-3-flash-preview") + ":generateContent" }}',
    '={{ ({ contents: [{ parts: [{ text: $("Prepare Prompt").first().json.stage_prompt + "\\n\\nThe previous response failed validation because: " + ($("Parse Attempt 1").first().json.stage_attempt_error || "unknown error") + ". Return corrected JSON only." }] }], generationConfig: { temperature: $("Prepare Prompt").first().json.stage_retry_temperatures[1], responseMimeType: "application/json", responseJsonSchema: $("Prepare Prompt").first().json.stage_config.schema } }) }}',
    [1220, -80],
    90000,
  );
  const parse2 = codeNode('Parse Attempt 2', parseAttemptCode(2, 'Parse Attempt 1'), [1460, -80]);
  const if2 = ifNode('Attempt 2 Valid?', '={{ $json.llm_valid }}', [1680, -80]);
  const retryGate3 = ifNode('Retry Attempt 3 Allowed?', '={{ ($json.stage_retry_limit || 3) > 2 }}', [1920, -80]);

  const attempt3 = httpJsonNode(
    'Gemini Attempt 3',
    '={{ "https://generativelanguage.googleapis.com/v1beta/models/" + ($("Prepare Prompt").first().json.stage_model || $env.GEMINI_MODEL || "gemini-3-flash-preview") + ":generateContent" }}',
    '={{ ({ contents: [{ parts: [{ text: $("Prepare Prompt").first().json.stage_prompt + "\\n\\nThe previous response failed validation because: " + ($("Parse Attempt 2").first().json.stage_attempt_error || "unknown error") + ". Return corrected JSON only." }] }], generationConfig: { temperature: $("Prepare Prompt").first().json.stage_retry_temperatures[2], responseMimeType: "application/json", responseJsonSchema: $("Prepare Prompt").first().json.stage_config.schema } }) }}',
    [1920, 60],
    90000,
  );
  const parse3 = codeNode('Parse Attempt 3', parseAttemptCode(3, 'Parse Attempt 2'), [2160, 60]);
  const if3 = ifNode('Attempt 3 Valid?', '={{ $json.llm_valid }}', [2380, 60]);

  const commitStage = codeNode('Commit Stage Result', commitStageCode(), [2620, -160]);
  const fallbackStage = codeNode('Fallback Stage Result', fallbackStageCode(), [2620, 120]);

  nodes.push(
    trigger,
    preparePrompt,
    attempt1,
    parse1,
    if1,
    retryGate2,
    attempt2,
    parse2,
    if2,
    retryGate3,
    attempt3,
    parse3,
    if3,
    commitStage,
    fallbackStage,
  );

  connect(connections, trigger.name, preparePrompt.name);
  connect(connections, preparePrompt.name, attempt1.name);
  connect(connections, attempt1.name, parse1.name);
  connect(connections, parse1.name, if1.name);
  connect(connections, if1.name, commitStage.name, 0, 0);
  connect(connections, if1.name, retryGate2.name, 1, 0);
  connect(connections, retryGate2.name, attempt2.name, 0, 0);
  connect(connections, retryGate2.name, fallbackStage.name, 1, 0);
  connect(connections, attempt2.name, parse2.name);
  connect(connections, parse2.name, if2.name);
  connect(connections, if2.name, commitStage.name, 0, 0);
  connect(connections, if2.name, retryGate3.name, 1, 0);
  connect(connections, retryGate3.name, attempt3.name, 0, 0);
  connect(connections, retryGate3.name, fallbackStage.name, 1, 0);
  connect(connections, attempt3.name, parse3.name);
  connect(connections, parse3.name, if3.name);
  connect(connections, if3.name, commitStage.name, 0, 0);
  connect(connections, if3.name, fallbackStage.name, 1, 0);

  return createWorkflow('PMF Gemini Stage Subflow', nodes, connections);
}

function buildAirtableControlPlaneSubflow() {
  const nodes = [];
  const connections = {};

  const trigger = createNode(
    'When Executed by Another Workflow',
    'n8n-nodes-base.executeWorkflowTrigger',
    1.1,
    [0, 0],
    {
      inputSource: 'passthrough',
    },
  );
  const prepareRequest = codeNode('Prepare Airtable Request', prepareAirtableRequestCode(), [260, 0]);
  const shouldCall = ifNode('Should Call Airtable?', '={{ $json.airtable_should_call }}', [520, 0]);
  const routeLookup = ifNode('Config Lookup Request?', '={{ $json.airtable_request_kind === "config_lookup" }}', [780, 0]);
  const lookup = airtableLookupNode('Airtable Config Lookup', [1020, -120]);
  const request = airtableRequestNode('Airtable Request', [1020, 120]);
  const normalize = codeNode('Normalize Airtable Response', normalizeAirtableResponseCode(), [1260, 0]);
  const skip = codeNode('Skip Airtable Sync', skipAirtableSyncCode(), [780, 120]);

  nodes.push(trigger, prepareRequest, shouldCall, routeLookup, lookup, request, normalize, skip);

  connect(connections, trigger.name, prepareRequest.name);
  connect(connections, prepareRequest.name, shouldCall.name);
  connect(connections, shouldCall.name, routeLookup.name, 0, 0);
  connect(connections, shouldCall.name, skip.name, 1, 0);
  connect(connections, routeLookup.name, lookup.name, 0, 0);
  connect(connections, routeLookup.name, request.name, 1, 0);
  connect(connections, lookup.name, normalize.name);
  connect(connections, request.name, normalize.name);

  return createWorkflow('PMF Airtable Control Plane Subflow', nodes, connections);
}

function buildMainWorkflow() {
  const nodes = [];
  const connections = {};

  const intake = webhookNode('Intake Webhook', 'pmf-brainstorm', 'POST');
  intake.position = [0, 200];
  const validate = codeNode('Validate Intake', validateIntakeCode(), [240, 200]);
  const gate = ifNode('Valid Request?', '={{ $json.is_valid }}', [480, 200]);
  const invalidResponse = responseNode(
    'Respond Invalid',
    '={{ $json.initial_response }}',
    '={{ $json.http_status }}',
  );
  invalidResponse.position = [720, 360];

  const createRun = postgresQueryNode(
    'Create Run',
    `
INSERT INTO pmf_runs (
  run_id,
  n8n_execution_id,
  status,
  idea,
  target_audience,
  monetization_guess,
  input_payload,
  warnings,
  created_at,
  updated_at
)
VALUES (
  $1::uuid,
  $2,
  'running',
  $3,
  $4,
  $5,
  $6::jsonb,
  $7::jsonb,
  NOW(),
  NOW()
)
RETURNING run_id;
    `.trim(),
    '={{ [$json.run_id, $json.n8n_execution_id, $json.idea, $json.target_audience, $json.monetization_guess, JSON.stringify($json.input_payload), JSON.stringify($json.warnings || [])] }}',
    [720, 60],
  );
  const restoreRunContext = codeNode('Restore Run Context', restoreRunContextCode(), [960, 60]);
  const acceptedResponse = responseNode(
    'Respond Accepted',
    '={{ $json.initial_response }}',
    '={{ $json.http_status }}',
  );
  acceptedResponse.position = [1200, 60];

  const prepareRunControlSync = codeNode(
    'Prepare Run Control Plane Sync',
    prepareAirtableRunSyncCode(),
    [1440, -120],
  );
  const runControlSync = executeLocalWorkflowNode(
    'Run Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [1680, -120],
  );
  const persistRunControlState = postgresQueryNode(
    'Persist Control Plane State',
    controlPlaneStateQuery(),
    '={{ [$json.run_id, JSON.stringify($json.control_plane_state || {})] }}',
    [1920, -120],
  );
  const restoreRunControlContext = codeNode(
    'Restore Run Control Context',
    restoreNodeContextCode('Run Control Plane Sync'),
    [2160, -120],
  );

  const research = executeLocalWorkflowNode('Research Subflow', RESEARCH_SUBFLOW_PATH, [2400, 60]);
  const logResearch = postgresQueryNode(
    'Persist Research Logs',
    stageLogQuery(),
    stageLogReplacementsExpression(),
    [2640, -100],
  );
  const restoreResearchContext = codeNode(
    'Restore Research Context',
    restoreNodeContextCode('Research Subflow'),
    [2880, -100],
  );
  const prepareResearchControlSync = codeNode(
    'Prepare Research Control Plane Sync',
    prepareAirtableStageSyncCode(),
    [3120, -100],
  );
  const researchControlSync = executeLocalWorkflowNode(
    'Research Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [3360, -100],
  );

  const marketConfig = codeNode('Prepare Market Stage', stageConfigCode(marketStage), [3600, 220]);
  const marketPromptConfig = executeLocalWorkflowNode(
    'Load Market Prompt Config',
    AIRTABLE_SUBFLOW_PATH,
    [3840, 220],
  );
  const market = executeLocalWorkflowNode('Market Scanner Subflow', GEMINI_SUBFLOW_PATH, [4080, 220]);
  const logMarket = postgresQueryNode(
    'Persist Market Logs',
    stageLogQuery(),
    stageLogReplacementsExpression(),
    [4320, 60],
  );
  const restoreMarketContext = codeNode(
    'Restore Market Context',
    restoreNodeContextCode('Market Scanner Subflow'),
    [4560, 60],
  );
  const prepareMarketControlSync = codeNode(
    'Prepare Market Control Plane Sync',
    prepareAirtableStageSyncCode(),
    [4800, 60],
  );
  const marketControlSync = executeLocalWorkflowNode(
    'Market Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [5040, 60],
  );

  const personaConfig = codeNode('Prepare Persona Stage', stageConfigCode(personaStage), [5280, 380]);
  const personaPromptConfig = executeLocalWorkflowNode(
    'Load Persona Prompt Config',
    AIRTABLE_SUBFLOW_PATH,
    [5520, 380],
  );
  const persona = executeLocalWorkflowNode('Persona Builder Subflow', GEMINI_SUBFLOW_PATH, [5760, 380]);
  const logPersona = postgresQueryNode(
    'Persist Persona Logs',
    stageLogQuery(),
    stageLogReplacementsExpression(),
    [6000, 220],
  );
  const restorePersonaContext = codeNode(
    'Restore Persona Context',
    restoreNodeContextCode('Persona Builder Subflow'),
    [6240, 220],
  );
  const preparePersonaControlSync = codeNode(
    'Prepare Persona Control Plane Sync',
    prepareAirtableStageSyncCode(),
    [6480, 220],
  );
  const personaControlSync = executeLocalWorkflowNode(
    'Persona Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [6720, 220],
  );

  const riskConfig = codeNode('Prepare Risk Stage', stageConfigCode(riskStage), [6960, 540]);
  const riskPromptConfig = executeLocalWorkflowNode(
    'Load Risk Prompt Config',
    AIRTABLE_SUBFLOW_PATH,
    [7200, 540],
  );
  const risk = executeLocalWorkflowNode('Risk Assessor Subflow', GEMINI_SUBFLOW_PATH, [7440, 540]);
  const logRisk = postgresQueryNode(
    'Persist Risk Logs',
    stageLogQuery(),
    stageLogReplacementsExpression(),
    [7680, 380],
  );
  const restoreRiskContext = codeNode(
    'Restore Risk Context',
    restoreNodeContextCode('Risk Assessor Subflow'),
    [7920, 380],
  );
  const prepareRiskControlSync = codeNode(
    'Prepare Risk Control Plane Sync',
    prepareAirtableStageSyncCode(),
    [8160, 380],
  );
  const riskControlSync = executeLocalWorkflowNode(
    'Risk Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [8400, 380],
  );

  const validationConfig = codeNode(
    'Prepare Validation Stage',
    stageConfigCode(validationStage),
    [7440, 700],
  );
  const validationPromptConfig = executeLocalWorkflowNode(
    'Load Validation Prompt Config',
    AIRTABLE_SUBFLOW_PATH,
    [7680, 700],
  );
  const validation = executeLocalWorkflowNode(
    'Validation Planner Subflow',
    GEMINI_SUBFLOW_PATH,
    [9120, 700],
  );
  const logValidation = postgresQueryNode(
    'Persist Validation Logs',
    stageLogQuery(),
    stageLogReplacementsExpression(),
    [9360, 540],
  );
  const restoreValidationContext = codeNode(
    'Restore Validation Context',
    restoreNodeContextCode('Validation Planner Subflow'),
    [9600, 540],
  );
  const prepareValidationControlSync = codeNode(
    'Prepare Validation Control Plane Sync',
    prepareAirtableStageSyncCode(),
    [9840, 540],
  );
  const validationControlSync = executeLocalWorkflowNode(
    'Validation Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [10080, 540],
  );

  const synthesisConfig = codeNode(
    'Prepare Synthesis Stage',
    stageConfigCode(synthesisStage),
    [8880, 860],
  );
  const synthesisPromptConfig = executeLocalWorkflowNode(
    'Load Synthesis Prompt Config',
    AIRTABLE_SUBFLOW_PATH,
    [10560, 860],
  );
  const synthesis = executeLocalWorkflowNode('Synthesis Subflow', GEMINI_SUBFLOW_PATH, [10800, 860]);
  const logSynthesis = postgresQueryNode(
    'Persist Synthesis Logs',
    stageLogQuery(),
    stageLogReplacementsExpression(),
    [11040, 700],
  );
  const restoreSynthesisContext = codeNode(
    'Restore Synthesis Context',
    restoreNodeContextCode('Synthesis Subflow'),
    [11280, 700],
  );
  const prepareSynthesisControlSync = codeNode(
    'Prepare Synthesis Control Plane Sync',
    prepareAirtableStageSyncCode(),
    [11520, 700],
  );
  const synthesisControlSync = executeLocalWorkflowNode(
    'Synthesis Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [11760, 700],
  );

  const finalize = codeNode('Finalize Result', finalizeCode(), [12000, 1020]);
  const prepareGateRecord = codeNode(
    'Prepare Gate Decision Record',
    prepareGateDecisionRecordCode(),
    [12240, 1020],
  );
  const reviewRequired = ifNode('Review Required?', '={{ !!$json.review_gate_record }}', [12480, 1020]);
  const persistGateDecision = postgresQueryNode(
    'Persist Gate Decision',
    gateDecisionUpsertQuery(),
    '={{ [$json.run_id, $json.review_gate_record.external_key, $json.review_gate_record.gate_type, $json.review_gate_record.decision_status, JSON.stringify($json.review_gate_record.reasons || []), $json.review_gate_record.operator_name, $json.review_gate_record.operator_notes, $json.review_gate_record.source] }}',
    [12720, 860],
  );
  const restoreGateDecisionContext = codeNode(
    'Restore Gate Decision Context',
    restoreNodeContextCode('Prepare Gate Decision Record'),
    [12960, 860],
  );
  const prepareFinalControlSync = codeNode(
    'Prepare Final Control Plane Sync',
    prepareAirtableFinalSyncCode(),
    [13680, 1180],
  );
  const finalControlSync = executeLocalWorkflowNode(
    'Final Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [13920, 1180],
  );
  const prepareGateControlSync = codeNode(
    'Prepare Gate Control Plane Sync',
    prepareAirtableGateSyncCode(),
    [14160, 1340],
  );
  const gateControlSync = executeLocalWorkflowNode(
    'Gate Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [14400, 1340],
  );
  const prepareExperimentControlSync = codeNode(
    'Prepare Experiment Control Plane Sync',
    prepareAirtableExperimentSyncCode(),
    [14640, 1500],
  );
  const experimentControlSync = executeLocalWorkflowNode(
    'Experiment Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [14880, 1500],
  );
  const persistFinal = postgresQueryNode(
    'Persist Final Result',
    finalRunQuery(),
    '={{ [$json.run_id, $json.final_status, JSON.stringify($json.research_context), JSON.stringify($json.analysis_outputs), JSON.stringify($json.final_output), JSON.stringify($json.warnings || []), JSON.stringify($json.control_plane_state || {})] }}',
    [13200, 1180],
  );
  const restoreFinalContext = codeNode(
    'Restore Final Context',
    restoreNodeContextCode('Prepare Gate Decision Record'),
    [13440, 1180],
  );

  nodes.push(
    intake,
    validate,
    gate,
    invalidResponse,
    createRun,
    restoreRunContext,
    acceptedResponse,
    prepareRunControlSync,
    runControlSync,
    persistRunControlState,
    restoreRunControlContext,
    research,
    logResearch,
    restoreResearchContext,
    prepareResearchControlSync,
    researchControlSync,
    marketConfig,
    marketPromptConfig,
    market,
    logMarket,
    restoreMarketContext,
    prepareMarketControlSync,
    marketControlSync,
    personaConfig,
    personaPromptConfig,
    persona,
    logPersona,
    restorePersonaContext,
    preparePersonaControlSync,
    personaControlSync,
    riskConfig,
    riskPromptConfig,
    risk,
    logRisk,
    restoreRiskContext,
    prepareRiskControlSync,
    riskControlSync,
    validationConfig,
    validationPromptConfig,
    validation,
    logValidation,
    restoreValidationContext,
    prepareValidationControlSync,
    validationControlSync,
    synthesisConfig,
    synthesisPromptConfig,
    synthesis,
    logSynthesis,
    restoreSynthesisContext,
    prepareSynthesisControlSync,
    synthesisControlSync,
    finalize,
    prepareGateRecord,
    reviewRequired,
    persistGateDecision,
    restoreGateDecisionContext,
    persistFinal,
    restoreFinalContext,
    prepareFinalControlSync,
    finalControlSync,
    prepareGateControlSync,
    gateControlSync,
    prepareExperimentControlSync,
    experimentControlSync,
  );

  connect(connections, intake.name, validate.name);
  connect(connections, validate.name, gate.name);
  connect(connections, gate.name, createRun.name, 0, 0);
  connect(connections, gate.name, invalidResponse.name, 1, 0);
  connect(connections, createRun.name, restoreRunContext.name);
  connect(connections, restoreRunContext.name, acceptedResponse.name);
  connect(connections, acceptedResponse.name, prepareRunControlSync.name);
  connect(connections, prepareRunControlSync.name, runControlSync.name);
  connect(connections, runControlSync.name, persistRunControlState.name);
  connect(connections, persistRunControlState.name, restoreRunControlContext.name);
  connect(connections, restoreRunControlContext.name, research.name);

  connect(connections, research.name, logResearch.name);
  connect(connections, logResearch.name, restoreResearchContext.name);
  connect(connections, restoreResearchContext.name, prepareResearchControlSync.name);
  connect(connections, prepareResearchControlSync.name, researchControlSync.name);
  connect(connections, researchControlSync.name, marketConfig.name);

  connect(connections, marketConfig.name, marketPromptConfig.name);
  connect(connections, marketPromptConfig.name, market.name);
  connect(connections, market.name, logMarket.name);
  connect(connections, logMarket.name, restoreMarketContext.name);
  connect(connections, restoreMarketContext.name, prepareMarketControlSync.name);
  connect(connections, prepareMarketControlSync.name, marketControlSync.name);
  connect(connections, marketControlSync.name, personaConfig.name);

  connect(connections, personaConfig.name, personaPromptConfig.name);
  connect(connections, personaPromptConfig.name, persona.name);
  connect(connections, persona.name, logPersona.name);
  connect(connections, logPersona.name, restorePersonaContext.name);
  connect(connections, restorePersonaContext.name, preparePersonaControlSync.name);
  connect(connections, preparePersonaControlSync.name, personaControlSync.name);
  connect(connections, personaControlSync.name, riskConfig.name);

  connect(connections, riskConfig.name, riskPromptConfig.name);
  connect(connections, riskPromptConfig.name, risk.name);
  connect(connections, risk.name, logRisk.name);
  connect(connections, logRisk.name, restoreRiskContext.name);
  connect(connections, restoreRiskContext.name, prepareRiskControlSync.name);
  connect(connections, prepareRiskControlSync.name, riskControlSync.name);
  connect(connections, riskControlSync.name, validationConfig.name);

  connect(connections, validationConfig.name, validationPromptConfig.name);
  connect(connections, validationPromptConfig.name, validation.name);
  connect(connections, validation.name, logValidation.name);
  connect(connections, logValidation.name, restoreValidationContext.name);
  connect(connections, restoreValidationContext.name, prepareValidationControlSync.name);
  connect(connections, prepareValidationControlSync.name, validationControlSync.name);
  connect(connections, validationControlSync.name, synthesisConfig.name);

  connect(connections, synthesisConfig.name, synthesisPromptConfig.name);
  connect(connections, synthesisPromptConfig.name, synthesis.name);
  connect(connections, synthesis.name, logSynthesis.name);
  connect(connections, logSynthesis.name, restoreSynthesisContext.name);
  connect(connections, restoreSynthesisContext.name, prepareSynthesisControlSync.name);
  connect(connections, prepareSynthesisControlSync.name, synthesisControlSync.name);
  connect(connections, synthesisControlSync.name, finalize.name);
  connect(connections, finalize.name, prepareGateRecord.name);
  connect(connections, prepareGateRecord.name, reviewRequired.name);
  connect(connections, reviewRequired.name, persistGateDecision.name, 0, 0);
  connect(connections, reviewRequired.name, persistFinal.name, 1, 0);
  connect(connections, persistGateDecision.name, restoreGateDecisionContext.name);
  connect(connections, restoreGateDecisionContext.name, persistFinal.name);
  connect(connections, persistFinal.name, restoreFinalContext.name);
  connect(connections, restoreFinalContext.name, prepareFinalControlSync.name);
  connect(connections, prepareFinalControlSync.name, finalControlSync.name);
  connect(connections, finalControlSync.name, prepareGateControlSync.name);
  connect(connections, prepareGateControlSync.name, gateControlSync.name);
  connect(connections, gateControlSync.name, prepareExperimentControlSync.name);
  connect(connections, prepareExperimentControlSync.name, experimentControlSync.name);
  

  return createWorkflow('PMF Brainstormer API', nodes, connections);
}

function buildStatusWorkflow() {
  const nodes = [];
  const connections = {};

  const webhook = webhookNode('Status Webhook', 'pmf-brainstorm-status', 'GET');
  webhook.position = [0, 120];

  const loadRun = postgresQueryNode(
    'Load Run Status',
    loadRunWithGateQuery(),
    '={{ [$json.query.run_id] }}',
    [280, 120],
  );

  const formatResponse = codeNode(
    'Format Status Response',
    `
const item = $input.first().json;
const runId = $('Status Webhook').first().json.query.run_id;

if (!item.run) {
  return [
    {
      json: {
        http_status: 404,
        response_body: {
          error: 'run not found',
          run_id: runId,
        },
      },
    },
  ];
}

return [
  {
    json: {
      http_status: 200,
      response_body: {
        run_id: item.run.run_id,
        status: item.run.status,
        result: item.run.final_output,
        warnings: item.run.warnings,
        error: item.run.error_summary,
        control_plane: item.run.control_plane_state,
        gate_decision: item.gate_decision,
        created_at: item.run.created_at,
        updated_at: item.run.updated_at,
        completed_at: item.run.completed_at,
      },
    },
  },
];
    `.trim(),
    [520, 120],
  );

  const respond = responseNode(
    'Respond Status',
    '={{ $json.response_body }}',
    '={{ $json.http_status }}',
  );
  respond.position = [760, 120];

  nodes.push(webhook, loadRun, formatResponse, respond);

  connect(connections, webhook.name, loadRun.name);
  connect(connections, loadRun.name, formatResponse.name);
  connect(connections, formatResponse.name, respond.name);

  return createWorkflow('PMF Brainstormer Status API', nodes, connections);
}

function buildReviewWorkflow() {
  const nodes = [];
  const connections = {};

  const webhook = webhookNode('Review Webhook', 'pmf-brainstorm-review', 'POST');
  webhook.position = [0, 200];
  const validate = codeNode('Validate Review Request', reviewIntakeCode(), [240, 200]);
  const gate = ifNode('Valid Review Request?', '={{ $json.is_valid }}', [480, 200]);
  const invalidResponse = responseNode(
    'Respond Review Invalid',
    '={{ $json.response_body }}',
    '={{ $json.http_status }}',
  );
  invalidResponse.position = [720, 360];

  const loadRun = postgresQueryNode(
    'Load Review Run',
    loadRunWithGateQuery(),
    '={{ [$json.run_id] }}',
    [720, 80],
  );
  const restoreReviewRequestContext = codeNode(
    'Restore Review Request Context',
    mergeNodeContextCode('Validate Review Request'),
    [960, 80],
  );
  const prepareDecision = codeNode('Prepare Review Decision', prepareReviewDecisionCode(), [1200, 80]);
  const reviewReady = ifNode('Review Request Ready?', '={{ $json.http_status === 200 }}', [1440, 80]);
  const reviewConflictResponse = responseNode(
    'Respond Review Conflict',
    '={{ $json.response_body }}',
    '={{ $json.http_status }}',
  );
  reviewConflictResponse.position = [1680, 240];
  const persistGateDecision = postgresQueryNode(
    'Persist Review Gate Decision',
    gateDecisionUpsertQuery(),
    '={{ [$json.run_id, $json.review_gate_record.external_key, $json.review_gate_record.gate_type, $json.review_gate_record.decision_status, JSON.stringify($json.review_gate_record.reasons || []), $json.review_gate_record.operator_name, $json.review_gate_record.operator_notes, $json.review_gate_record.source] }}',
    [1680, -80],
  );
  const restoreReviewDecisionContext = codeNode(
    'Restore Review Decision Context',
    restoreNodeContextCode('Prepare Review Decision'),
    [1920, -80],
  );
  const updateRun = postgresQueryNode(
    'Update Run After Review',
    `
UPDATE pmf_runs
SET
  status = $2::pmf_run_status,
  control_plane_state = $3::jsonb,
  final_output = $4::jsonb,
  updated_at = NOW(),
  completed_at = NOW()
WHERE run_id = $1::uuid
RETURNING run_id;
    `.trim(),
    '={{ [$json.run_id, $json.final_status, JSON.stringify($json.control_plane_state || {}), JSON.stringify($json.updated_final_output || null)] }}',
    [2160, -80],
  );
  const restoreReviewRunContext = codeNode(
    'Restore Review Run Context',
    restoreNodeContextCode('Prepare Review Decision'),
    [2400, -80],
  );
  const prepareFinalSync = codeNode(
    'Prepare Review Final Control Sync',
    prepareAirtableFinalSyncCode(),
    [2640, -220],
  );
  const finalSync = executeLocalWorkflowNode(
    'Review Final Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [2880, -220],
  );
  const prepareGateSync = codeNode(
    'Prepare Review Gate Control Sync',
    prepareAirtableGateSyncCode(),
    [3120, -80],
  );
  const gateSync = executeLocalWorkflowNode(
    'Review Gate Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [3360, -80],
  );
  const respond = responseNode(
    'Respond Review Success',
    '={{ $json.response_body }}',
    '={{ $json.http_status }}',
  );
  respond.position = [3600, -80];

  nodes.push(
    webhook,
    validate,
    gate,
    invalidResponse,
    loadRun,
    restoreReviewRequestContext,
    prepareDecision,
    reviewReady,
    reviewConflictResponse,
    persistGateDecision,
    restoreReviewDecisionContext,
    updateRun,
    restoreReviewRunContext,
    prepareFinalSync,
    finalSync,
    prepareGateSync,
    gateSync,
    respond,
  );

  connect(connections, webhook.name, validate.name);
  connect(connections, validate.name, gate.name);
  connect(connections, gate.name, loadRun.name, 0, 0);
  connect(connections, gate.name, invalidResponse.name, 1, 0);
  connect(connections, loadRun.name, restoreReviewRequestContext.name);
  connect(connections, restoreReviewRequestContext.name, prepareDecision.name);
  connect(connections, prepareDecision.name, reviewReady.name);
  connect(connections, reviewReady.name, persistGateDecision.name, 0, 0);
  connect(connections, reviewReady.name, reviewConflictResponse.name, 1, 0);
  connect(connections, persistGateDecision.name, restoreReviewDecisionContext.name);
  connect(connections, restoreReviewDecisionContext.name, updateRun.name);
  connect(connections, updateRun.name, restoreReviewRunContext.name);
  connect(connections, restoreReviewRunContext.name, prepareFinalSync.name);
  connect(connections, prepareFinalSync.name, finalSync.name);
  connect(connections, finalSync.name, prepareGateSync.name);
  connect(connections, prepareGateSync.name, gateSync.name);
  connect(connections, gateSync.name, respond.name);

  return createWorkflow('PMF Brainstormer Review API', nodes, connections);
}

function buildErrorWorkflow() {
  const nodes = [];
  const connections = {};

  const trigger = createNode(
    'Error Trigger',
    'n8n-nodes-base.errorTrigger',
    1,
    [0, 120],
    {},
  );

  const shapeError = codeNode(
    'Build Error Payload',
    `
const input = $input.first().json;
const execution = input.execution || {};
const workflow = input.workflow || {};
const summary = {
  workflow_name: workflow.name || null,
  workflow_id: workflow.id || null,
  execution_id: execution.id || null,
  last_node: execution.lastNodeExecuted || null,
  message: execution.error?.message || input.message || 'Workflow execution failed',
  stack: execution.error?.stack || null,
  mode: execution.mode || null,
  failed_at: new Date().toISOString(),
};

return [
  {
    json: {
      execution_id: summary.execution_id,
      error_summary: summary,
    },
  },
];
    `.trim(),
    [260, 120],
  );

  const markFailed = postgresQueryNode(
    'Mark Run Failed',
    `
UPDATE pmf_runs
SET
  status = 'failed',
  error_summary = $2::jsonb,
  updated_at = NOW(),
  completed_at = NOW()
WHERE n8n_execution_id = $1
RETURNING run_id;
    `.trim(),
    '={{ [$json.execution_id, JSON.stringify($json.error_summary)] }}',
    [520, 120],
  );
  const restoreFailureContext = codeNode(
    'Restore Failure Context',
    restoreNodeContextCode('Build Error Payload'),
    [780, 120],
  );

  const loadFailedRun = postgresQueryNode(
    'Load Failed Run State',
    `
SELECT
  run_id,
  control_plane_state,
  warnings,
  error_summary
FROM pmf_runs
WHERE n8n_execution_id = $1
LIMIT 1;
    `.trim(),
    '={{ [$json.execution_id] }}',
    [1040, 120],
  );
  const prepareFailureControlSync = codeNode(
    'Prepare Failure Control Plane Sync',
    prepareAirtableFailureSyncCode(),
    [1300, 120],
  );
  const failureControlSync = executeLocalWorkflowNode(
    'Failure Control Plane Sync',
    AIRTABLE_SUBFLOW_PATH,
    [1560, 120],
  );

  nodes.push(
    trigger,
    shapeError,
    markFailed,
    restoreFailureContext,
    loadFailedRun,
    prepareFailureControlSync,
    failureControlSync,
  );
  connect(connections, trigger.name, shapeError.name);
  connect(connections, shapeError.name, markFailed.name);
  connect(connections, markFailed.name, restoreFailureContext.name);
  connect(connections, restoreFailureContext.name, loadFailedRun.name);
  connect(connections, loadFailedRun.name, prepareFailureControlSync.name);
  connect(connections, prepareFailureControlSync.name, failureControlSync.name);

  return createWorkflow('PMF Brainstormer Error Handler', nodes, connections);
}

writeJson(join(subflowDir, 'pmf-research.json'), buildResearchSubflow());
writeJson(join(subflowDir, 'pmf-gemini-stage.json'), buildGeminiSubflow());
writeJson(join(subflowDir, 'pmf-airtable-control-plane.json'), buildAirtableControlPlaneSubflow());
writeJson(join(entrypointDir, 'pmf-brainstorm-api.json'), buildMainWorkflow());
writeJson(join(entrypointDir, 'pmf-brainstorm-status.json'), buildStatusWorkflow());
writeJson(join(entrypointDir, 'pmf-brainstorm-review.json'), buildReviewWorkflow());
writeJson(join(entrypointDir, 'pmf-error-handler.json'), buildErrorWorkflow());
