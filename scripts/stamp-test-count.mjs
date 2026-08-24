/**
 * Records how many tests actually ran, so the docs can quote a real number.
 *
 * The landing page wants to say "1,452 tests" and the only way to know that is to
 * have run them — a static `grep it(` undercounts this repo badly, because several
 * suites are table-driven (`segment-identity-owners` runs every assertion twice, on
 * purpose). A number that cannot be measured should not be printed, and a number
 * that is printed should not be typed by hand: the landing had four hardcoded
 * counts and every one of them was already drifting.
 *
 * So: `pnpm test` emits vitest's JSON report to a gitignored file, and this reads
 * the totals out of it into a two-line stamp that IS committed. Cost is one extra
 * reporter on a run that was happening anyway — no second suite, which matters
 * because this runs on every pre-push.
 *
 * Deliberately forgiving: if the report is missing or unparseable it leaves the
 * previous stamp alone and says so. A test run must never fail because a docs
 * number could not be refreshed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = resolve(root, '.vitest-report.json');
const STAMP = resolve(root, 'apps/docs/src/data/test-counts.json');

if (!existsSync(REPORT)) {
    console.log('[stamp-test-count] no vitest JSON report; keeping the previous stamp.');
    process.exit(0);
}

let report;
try {
    report = JSON.parse(readFileSync(REPORT, 'utf8'));
} catch (err) {
    console.log(`[stamp-test-count] report unreadable (${err.message}); keeping the previous stamp.`);
    process.exit(0);
}

// vitest's JSON reporter is jest-compatible at the top level.
//
// `numTotalTestSuites` is NOT the file count — it counts `describe` blocks, and
// stamped 490 for a run of 121 files. `testResults` has one entry per test file,
// which is what the docs mean by "test files".
const tests = report.numTotalTests ?? 0;
const passed = report.numPassedTests ?? 0;
const files = report.testResults?.length ?? 0;

if (!tests || !files) {
    console.log('[stamp-test-count] report had no totals; keeping the previous stamp.');
    process.exit(0);
}

// Only a full green run is quotable: a partial or failing run would stamp a
// smaller number and the docs would quietly understate the suite.
if (passed !== tests) {
    console.log(`[stamp-test-count] ${passed}/${tests} passed — not stamping a failing run.`);
    process.exit(0);
}

const next = { tests, files };
const prev = existsSync(STAMP) ? readFileSync(STAMP, 'utf8') : '';
const body = JSON.stringify(next, null, 2) + '\n';
if (prev === body) {
    console.log(`[stamp-test-count] unchanged: ${tests} tests in ${files} files.`);
    process.exit(0);
}

mkdirSync(dirname(STAMP), { recursive: true });
writeFileSync(STAMP, body);
console.log(`[stamp-test-count] ${tests} tests in ${files} files → ${STAMP}`);
