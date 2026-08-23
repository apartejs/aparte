/**
 * `svelte-check` for this example, minus one line of third-party noise.
 *
 * THIS SUPPRESSES A SYMPTOM. It does not fix the cause, and it is deliberately
 * narrow so it cannot hide anything else.
 *
 * What happens: checking this app prints
 *
 *     fatal error: all goroutines are asleep - deadlock!
 *
 * to stderr *after* reporting its results. `esbuild.exe` is the process that dies
 * (esbuild is written in Go, hence "goroutines"); it is spawned somewhere in the
 * svelte-check → vite chain and never shut down cleanly.
 *
 * What was ruled out, so nobody pays for it twice:
 *   - svelte-check version — 4.7.6 IS the latest, and it does NOT deadlock on a
 *     bare project, nor on the Svelte 4 example's tsconfig
 *   - the output mode and `--threshold` — happens with every combination
 *   - the `.svelte-kit` build cache of `@aparte/svelte` — removed, still happens
 *   - `vitePreprocess()` in EITHER svelte.config.js (this app's or the wrapper
 *     package's) — emptied both, still happens
 *
 * What IS known: it is triggered by following the `@aparte/svelte` import out of
 * `App.svelte`, and it predates the 0.8.0 packaging work (it is in a gate log from
 * before that change). Its intermittent look in CI logs is only nx caching the
 * task — when the command actually runs, it is deterministic.
 *
 * Why suppress rather than live with it: the exit code and the diagnostics are
 * CORRECT (verified by sabotage — a real type error still reports and still exits
 * 1). A "fatal error" printed by a green gate on every run is how a team learns to
 * stop reading the gate, which costs more than this message is worth.
 *
 * The safety properties that make this acceptable:
 *   - only the exact known line is dropped; every other byte of stderr passes
 *   - the child's exit code is propagated untouched, so nothing can be hidden
 *   - if the line ever stops appearing, this wrapper becomes a no-op rather than
 *     silently masking something new
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const NOISE = 'fatal error: all goroutines are asleep - deadlock!';

// Run svelte-check's own entry with this Node, rather than the `.cmd` shim through
// a shell: no `shell: true` (which Node now warns about, since args are only
// concatenated), and identical behaviour on Windows and POSIX.
const require = createRequire(import.meta.url);
const bin = require.resolve('svelte-check/bin/svelte-check');

const child = spawn(
    process.execPath,
    [bin, '--tsconfig', './tsconfig.json', '--threshold', 'error', ...process.argv.slice(2)],
    { stdio: ['inherit', 'inherit', 'pipe'] },
);

let pending = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split('\n');
    // Keep the last (possibly partial) line buffered.
    pending = lines.pop() ?? '';
    for (const line of lines) {
        if (line.trim() === NOISE) continue;
        process.stderr.write(`${line}\n`);
    }
});
child.stderr.on('end', () => {
    if (pending && pending.trim() !== NOISE) process.stderr.write(pending);
});

child.on('close', (code, signal) => {
    if (signal) {
        process.stderr.write(`[svelte5 typecheck] svelte-check was killed by ${signal}\n`);
        process.exit(1);
    }
    process.exit(code ?? 1);
});
