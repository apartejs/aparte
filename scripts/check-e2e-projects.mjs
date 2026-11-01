/**
 * Every Playwright project runs in a CI job.
 *
 * ci.yml runs the browser suite as one job per project, listed in its matrix
 * (`- { project: react-webkit, app: react }`). A project added to e2e/playwright.config.ts and to no job
 * would never run on a pull request, and nothing would say so: the jobs it is missing from
 * stay green. This lists the projects as CI sees them (CI=1 keeps WebKit and Firefox) and
 * fails on any that no job names.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const list = execFileSync('pnpm', ['--filter', '@aparte-workspace/e2e', 'exec', 'playwright', 'test', '--list'], {
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    shell: process.platform === 'win32',
    windowsHide: true,
});
const projects = new Set([...list.matchAll(/^\s*\[([\w-]+)\]/gm)].map((m) => m[1]));

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const named = new Set([...ci.matchAll(/\{ project: ([\w-]+), app: [\w-]+ \}/g)].map((m) => m[1]));

if (projects.size < 10) {
    console.error(`[e2e-projects] read only ${projects.size} project(s) from \`playwright test --list\` — the listing broke, not the jobs.`);
    process.exit(1);
}
const missing = [...projects].filter((p) => !named.has(p)).sort();
const stale = [...named].filter((p) => !projects.has(p)).sort();
if (missing.length || stale.length) {
    if (missing.length) console.error(`[e2e-projects] in no e2e job of ci.yml: ${missing.join(', ')}`);
    if (stale.length) console.error(`[e2e-projects] named in ci.yml, not a project: ${stale.join(', ')}`);
    process.exit(1);
}
console.log(`[e2e-projects] OK: ${projects.size} Playwright projects, each in an e2e job.`);
