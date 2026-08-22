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
 * The full gate now runs first (see the `release` script); this covers what a gate
 * cannot see: the state of the working tree and where it came from.
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

if (problems.length) {
    console.error('\n[prerelease] refusing to publish:\n');
    for (const p of problems) console.error(`  - ${p}\n`);
    process.exit(1);
}

console.log(`[prerelease] OK: clean tree, on ${branch}, in sync with origin.`);
