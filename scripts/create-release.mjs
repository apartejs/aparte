#!/usr/bin/env node
/*
 * Creates the GitHub Release for a release tag, its body the matching section of the root
 * CHANGELOG. Run by `release-notes.yml` (a maintainer's tag push) and by `ci.yml`'s
 * `release` job, whose own tag pushes trigger no workflow. A Release that exists already is
 * left as it is, and a version older than the newest Release is not marked "Latest".
 *
 * Usage: TAG=v<version> GH_TOKEN=<token> node scripts/create-release.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lower } from './publishable.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

const tag = process.env.TAG ?? '';
if (!/^v\d+\.\d+\.\d+/.test(tag)) {
    console.log(`::error::TAG must be a release tag (v<version>), not "${tag}".`);
    process.exit(1);
}
const version = tag.slice(1);
const repo = process.env.GITHUB_REPOSITORY || 'apartejs/aparte';

try {
    run('gh', ['release', 'view', tag, '--repo', repo]);
    console.log(`The Release ${tag} exists already.`);
    process.exit(0);
} catch { /* not created yet */ }

let notes = run(process.execPath, [join(root, 'scripts/gen-root-changelog.mjs'), '--section', version]);

// The Releases API refuses a body over 125000 characters with an HTTP 422, which is how the
// 0.8.0 Release failed to exist: its section was 416 KB, because the aggregate repeated every
// shared changeset once per package in the lockstep group. That is fixed at the source (see
// `buildSection` in gen-root-changelog.mjs, now grouped by change), and this is the belt: a
// release that grows past the ceiling anyway gets a truncated body and a link, never a
// missing Release. Truncation happens on a line boundary so the body cannot end mid-fence.
const LIMIT = 120000;
console.log(`notes: ${notes.length} characters, ${notes.split('\n').length} lines`);
if (notes.length > LIMIT) {
    console.log(`::warning::release notes are ${notes.length} characters (>${LIMIT}) — truncating`);
    notes = notes.slice(0, notes.lastIndexOf('\n', LIMIT));
    const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
    notes += `\n\n---\n\n_These notes were truncated at ${LIMIT} characters (the GitHub Releases limit\n`
        + `is 125000). The full section is in [CHANGELOG.md](${server}/${repo}/blob/${tag}/CHANGELOG.md)._\n`;
}
const file = join(mkdtempSync(join(tmpdir(), 'release-notes-')), 'notes.md');
writeFileSync(file, notes);

const args = ['release', 'create', tag, '--repo', repo, '--title', `aparté ${version}`, '--notes-file', file, '--verify-tag'];
// Anything with a hyphen in its version is a prerelease (-alpha.N, -rc.N): marked so it
// never shows up as "Latest" on the repo home.
if (version.includes('-')) args.push('--prerelease');
// A release finished late (a failed run re-run after a newer one shipped) must not take
// the "Latest" badge from the newer Release.
let newest = null;
try { newest = run('gh', ['release', 'view', '--repo', repo, '--json', 'tagName', '--jq', '.tagName']).trim(); } catch { /* none yet */ }
if (newest && /^v\d/.test(newest) && lower(version, newest.slice(1))) args.push('--latest=false');

run('gh', args);
console.log(`Created the Release ${tag}${args.includes('--latest=false') ? ` (not Latest: ${newest} is newer)` : ''}.`);
