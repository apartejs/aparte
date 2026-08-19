/*
 * Points git at .githooks/ — run by the root `prepare` script on every install.
 *
 * It must NEVER fail an install. `git config` needs a usable git directory, and
 * there are legitimate installs without one: a CI container (where the checkout is
 * owned by another UID, so git refuses it as "dubious ownership"), a published
 * tarball, a Docker build layer. That exact case broke the e2e job for real: exit
 * 128 out of `prepare`, and `pnpm install --frozen-lockfile` died with it.
 *
 * But a silent `|| true` would be worse than the bug: hooks are how this repo
 * enforces its gate, so a developer whose install quietly skipped them would lose
 * that with no signal. So: skip deliberately in CI (CI *is* the gate there), and
 * anywhere else print a loud warning while still exiting 0.
 */
import { execFileSync } from 'node:child_process';

if (process.env.CI) {
    console.log('[aparte] CI detected — skipping git hook install (CI is the gate here).');
    process.exit(0);
}

try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'pipe' });
    console.log('[aparte] git hooks installed (core.hooksPath -> .githooks)');
} catch (err) {
    const reason = (err.stderr?.toString() || err.message || '').trim().split('\n')[0];
    console.warn('');
    console.warn('[aparte] WARNING: could not install the git hooks.');
    console.warn(`  ${reason}`);
    console.warn('  Your commits and pushes are NOT gated locally. Fix it with:');
    console.warn('    git config core.hooksPath .githooks');
    console.warn('');
    // Deliberately not a failure: an install must not die over a convenience.
}
