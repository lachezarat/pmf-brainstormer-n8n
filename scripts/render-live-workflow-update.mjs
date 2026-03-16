import { readFileSync, writeFileSync } from 'node:fs';

const outputPath = process.argv[2] || '/tmp/update_n8n_workflows.sql';

const specs = [
  {
    name: 'PMF Brainstormer API',
    path: 'workflows/entrypoints/pmf-brainstorm-api.json',
    tag: 'api',
  },
  {
    name: 'PMF Brainstormer Review API',
    path: 'workflows/entrypoints/pmf-brainstorm-review.json',
    tag: 'review',
  },
  {
    name: 'PMF Brainstormer Error Handler',
    path: 'workflows/entrypoints/pmf-error-handler.json',
    tag: 'error',
  },
];

function escapeSqlText(value) {
  return String(value).replace(/'/g, "''");
}

function dollarQuote(value, tagBase) {
  let tag = tagBase;
  while (String(value).includes(`$${tag}$`)) {
    tag += '_x';
  }

  return `$${tag}$${value}$${tag}$`;
}

let sql = 'BEGIN;\n';

for (const spec of specs) {
  const workflow = JSON.parse(readFileSync(spec.path, 'utf8'));

  sql += `UPDATE workflow_entity
SET nodes = ${dollarQuote(JSON.stringify(workflow.nodes), `${spec.tag}_nodes`)}::json,
    connections = ${dollarQuote(JSON.stringify(workflow.connections), `${spec.tag}_connections`)}::json,
    "pinData" = '{}'::json,
    meta = ${dollarQuote(JSON.stringify(workflow.meta || {}), `${spec.tag}_meta`)}::json,
    "versionId" = '${escapeSqlText(workflow.versionId)}',
    "updatedAt" = NOW()
WHERE name = '${escapeSqlText(spec.name)}';
`;
}

sql += 'COMMIT;\n';

writeFileSync(outputPath, sql, 'utf8');
console.log(outputPath);
