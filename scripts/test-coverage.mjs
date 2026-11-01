/**
 * The unit suite with its coverage gate, measured the way CI measures it: three shards,
 * each writing a blob report, then one merge that applies the floors in vitest.config.ts.
 *
 * CI runs the shards side by side, and v8 counts branches a few points higher once shard
 * reports are merged than in a single run (measured 2026-11-01: +2 to +4 on five packages).
 * A floor set from one measurement and judged on the other is either slack or red, so the
 * gate measures as CI does. CI calls the same two halves itself (`test` and `coverage` in
 * ci.yml); the shard count is the matrix there.
 */
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const SHARDS = 3;
const run = (command, env = {}) =>
    execSync(command, { stdio: 'inherit', windowsHide: true, env: { ...process.env, ...env } });

rmSync('.vitest-reports', { recursive: true, force: true });
for (let shard = 1; shard <= SHARDS; shard++) {
    run(`vitest run --coverage --shard=${shard}/${SHARDS} --reporter=blob`, { APARTE_TEST_SHARD: '1' });
}
run('vitest run --merge-reports --coverage --reporter=default --reporter=json --outputFile.json=.vitest-report.json');
