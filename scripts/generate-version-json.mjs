import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const outputPath = path.join(rootDir, 'client', 'public', 'version.json');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

let commit;
try {
  commit = execSync('git rev-parse --short HEAD', {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  commit = undefined;
}

const now = new Date();
const versionInfo = {
  version: packageJson.version,
  source: 'package.json',
  generatedAt: now.toISOString(),
  generatedDate: now.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }),
  ...(commit ? { commit } : {}),
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(versionInfo, null, 2)}\n`);

console.log(`Wrote ${outputPath} (version ${versionInfo.version})`);
