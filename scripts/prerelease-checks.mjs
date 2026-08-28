/**
 * The things that must be true before 15 packages go to npm.
 *
 * `pnpm release` used to be `build && changeset publish && align-dist-tags &&
 * tag-release`. No lint, no typecheck, no tests, no packaging check, no clean-tree
 * check, no branch check — and it is run by hand from a workstation. A maintainer on
 * a dirty branch with failing tests could push all 15 packages, after which
 * `align-dist-tags.mjs` would point BOTH `alpha` and `latest` at them. There was
 * nothing between a broken tree and `npm i @aparte/core`.
 *
 * This covers what a gate cannot see: the state of the working tree, where it came
 * from, and whether CI agreed.
 *
 * These four checks ARE the gate now. `release` used to re-run `gate:full` here, on a
 * workstation, minutes after CI had validated the identical tree — a third full run of
 * one commit, for about twenty minutes. Check 4 asks GitHub for the verdict instead,
 * which is both faster and better evidence: CI runs on `ubuntu-latest`, and 0.13.0
 * shipped a defect only a POSIX build could expose.
 */
import { execFileSync } from 'node:child_process';

// stderr piped, not inherited: a missing `origin/<branch>` is an expected answer
// here, and letting git print `fatal:` on top of our own message reads like a
// crash rather than a refusal.
const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const problems = [];

// 1. A clean tree. Publishing from a dirty checkout means the tarball contains
//    something no commit describes.
const dirty = git('status', '--porcelain');
if (dirty) {
    problems.push(
        'the working tree is not clean — the published tarball would contain changes\n'
        + '    that no commit describes:\n'
        + dirty.split('\n').slice(0, 10).map(l => `      ${l}`).join('\n'),
    );
}

// 2. On the release branch. A publish from a feature branch ships code that never
//    passed the branch's own review.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') {
    problems.push(`on branch \`${branch}\`, not \`main\` — publish the release commit from main.`);
}

// 3. In sync with the remote, so the tag about to be created points at something
//    that exists for everyone else.
try {
    const local = git('rev-parse', 'HEAD');
    const remote = git('rev-parse', `origin/${branch}`);
    if (local !== remote) {
        problems.push(
            `HEAD (${local.slice(0, 7)}) is not \`origin/${branch}\` (${remote.slice(0, 7)}) — `
            + 'push first, so the release tag points at a commit CI has seen.',
        );
    }
} catch {
    problems.push(`no \`origin/${branch}\` to compare against — is the branch pushed?`);
}

/*
 * 4. And CI actually PASSED on that commit.
 *
 * Check 3 above says the tag should point "at a commit CI has seen" — seen, never
 * judged. This is the judgement, and adding it is what lets `release` stop re-running
 * `gate:full` on a tree the CI validated minutes earlier. It is not a weaker guard, it
 * is a better-sited one: the gate re-run happens on a maintainer's workstation, and CI
 * runs on `ubuntu-latest`. The 0.13.0 release shipped a bug that only a POSIX build
 * could expose — a path split on a hardcoded backslash that blanked a whole reference
 * page — and no number of Windows gate runs would ever have seen it.
 *
 * Only the `ci` workflow counts. `release-notes` runs on the tag, after this; and a
 * `release` workflow that failed on every push to main (the org forbids Actions from
 * opening the Version PR) was removed on 2026-08-28 — a guard demanding every workflow
 * be green would still be wrong the day another one is added.
 */
const CI_WORKFLOW = 'ci';
try {
    const sha = git('rev-parse', 'HEAD');
    const raw = execFileSync(
        'gh',
        ['run', 'list', '--commit', sha, '--json', 'name,status,conclusion', '--limit', '20'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const runs = JSON.parse(raw).filter((r) => r.name === CI_WORKFLOW);
    if (runs.length === 0) {
        problems.push(
            `no \`${CI_WORKFLOW}\` run for ${sha.slice(0, 7)} — CI has not judged this commit.\n`
            + '    Wait for it, or push the commit if it is not on the remote yet.',
        );
    } else if (runs.some((r) => r.status !== 'completed')) {
        problems.push(`the \`${CI_WORKFLOW}\` run for ${sha.slice(0, 7)} is still running — wait for it.`);
    } else if (runs.some((r) => r.conclusion !== 'success')) {
        const bad = runs.filter((r) => r.conclusion !== 'success').map((r) => r.conclusion).join(', ');
        problems.push(
            `the \`${CI_WORKFLOW}\` run for ${sha.slice(0, 7)} concluded \`${bad}\`.\n`
            + '    Fifteen packages are about to be published from it. Fix it first.',
        );
    }
} catch (error) {
    // A missing or unauthenticated `gh` REFUSES rather than waves through: this check
    // replaced a full gate run, so its silence would be the release's only blind spot.
    problems.push(
        'could not ask GitHub whether CI passed on this commit '
        + `(${String(error.message ?? error).split('\n')[0]}).\n`
        + '    `gh auth status` should work here — this check is what stands in for the\n'
        + '    gate run that `release` no longer does itself.',
    );
}

if (problems.length) {
    console.error('\n[prerelease] refusing to publish:\n');
    for (const p of problems) console.error(`  - ${p}\n`);
    process.exit(1);
}

console.log(`[prerelease] OK: clean tree, on ${branch}, in sync with origin.`);
