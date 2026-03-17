import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = join(repoRoot, 'workflow-backups', stamp);

mkdirSync(backupRoot, { recursive: true });

const pathsToCopy = [
  'workflows',
  'postgres/init',
  'fixtures',
  'docs',
  'README.md',
];

for (const relativePath of pathsToCopy) {
  const source = join(repoRoot, relativePath);
  const target = join(backupRoot, relativePath);

  if (!existsSync(source)) {
    continue;
  }

  cpSync(source, target, { recursive: true });
}

writeFileSync(
  join(backupRoot, 'manifest.json'),
  `${JSON.stringify(
    {
      created_at: new Date().toISOString(),
      included_paths: pathsToCopy,
      notes: 'Generated workflow backup bundle for repo handoff and restore.',
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(backupRoot);
