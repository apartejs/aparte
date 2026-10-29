#!/usr/bin/env node
/*
 * Says what the release jobs of `ci.yml` have left to do for the version the checked-out commit carries,
 * and writes it to $GITHUB_OUTPUT:
 *   publish   packages of that version missing from npm
 *   align     `beta` or `latest` still on a lower version
 *   tags      the release tag or a package tag missing from GitHub
 *   notes     the GitHub Release missing
 *   release   any of the four
 *   tag       `v<version>`
 *
 * Every piece is asked of npm and GitHub for every package, because a release can stop
 * anywhere: changesets publishes concurrently, tags locally what went out and exits 1, and
 * a step after it can fail too. The run that finds a piece missing redoes that piece; so a
 * rerun finishes what a failed run left.
 *
 * Only the push that changed the version — `packages/core/package.json` between the commit
 * before the push (`BEFORE_SHA`, else the first parent) and this one — may publish it. A later
 * commit that finds it unfinished only warns: releasing there would publish ITS code under
 * the version, and the version commit's own run is the one that goes red if its release
 * failed. On such a commit, a package the version commit did not have yet (a feature PR adds
 * packages ahead of the next version) is not counted as missing.
 *
 * `ci.yml` runs this twice: in `release-check`, read-only, to decide whether the `release`
 * job needs write tokens at all, and again inside `release`, which holds the release lock,
 * so two version commits released close together see each other's work.
 *
 * Never backwards: a version below the `beta` npm serves for core is refused, since
 * aligning it would move `beta` and `latest` down.
 *
 * Usage: [HEAD_SHA=<sha>] [BEFORE_SHA=<sha>] [GH_TOKEN=<token>] node scripts/release-pending.mjs
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lower, majorRefusal, offMajor, publishable } from './publishable.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function output(key, value) {
    console.log(`${key}=${value}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function fail(message) {
    console.log(`::error::${message}`);
    process.exit(1);
}

/** Core's version at a commit, or `null` where the file does not exist. */
function versionAt(rev) {
    try { return JSON.parse(git('show', `${rev}:packages/core/package.json`)).version; } catch { return null; }
}

async function json(url, headers = {}) {
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.json();
}

const head = process.env.HEAD_SHA || git('rev-parse', 'HEAD');
const { version } = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'));
try { lower(version, version); } catch { fail(`core's version "${version}" is not one this script can compare.`); }
const tag = `v${version}`;
output('tag', tag);

// The state before this push: `github.event.before`, kept on a rerun — a rebase merge pushes
// several commits, and the bump need not be the last — else the first parent.
const before = /^[0-9a-f]{40}$/.test(process.env.BEFORE_SHA ?? '') && !/^0+$/.test(process.env.BEFORE_SHA) ? process.env.BEFORE_SHA : `${head}^1`;
// The commit that brought this version: this one if the push changed it; otherwise the first
// on main's first-parent line whose parent carried another.
const versionCommit = versionAt(before) === version
    ? git('rev-list', '--first-parent', '-n', '500', head).split('\n')
        .find((sha) => versionAt(sha) === version && versionAt(`${sha}^1`) !== version) ?? null
    : head;

let packages = publishable(root);
if (packages.length === 0) fail('no publishable package found under packages/: the walk went blind.');
const off = offMajor(packages);
if (off.length) fail(majorRefusal(off));
if (versionCommit && versionCommit !== head) {
    packages = packages.filter((pkg) => {
        try { git('cat-file', '-e', `${versionCommit}:${pkg.dir}/package.json`); return true; } catch { return false; }
    });
}

const missing = [];
const misaligned = [];
for (const pkg of packages) {
    const name = pkg.name.replace('/', '%2F');
    if (!(await json(`https://registry.npmjs.org/${name}/${pkg.version}`))) missing.push(`${pkg.name}@${pkg.version}`);
    const tags = (await json(`https://registry.npmjs.org/-/package/${name}/dist-tags`)) ?? {};
    if (['beta', 'latest'].some((t) => !tags[t] || lower(tags[t], pkg.version))) misaligned.push(pkg.name);
}

const onOrigin = new Set(git('ls-remote', '--tags', 'origin').split('\n')
    .map((line) => line.split('refs/tags/')[1]?.replace(/\^\{\}$/, '')).filter(Boolean));
const missingTags = [tag, ...packages.map((pkg) => `${pkg.name}@${pkg.version}`)].filter((t) => !onOrigin.has(t));

const repo = process.env.GITHUB_REPOSITORY || 'apartejs/aparte';
const auth = process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {};
const released = (await json(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, auth)) !== null;

console.log(`${packages.length} packages at ${version}.`);
console.log(`  npm: ${missing.length ? `missing ${missing.join(', ')}` : 'all published'}; dist-tags: ${misaligned.length ? `behind on ${misaligned.join(', ')}` : 'aligned'}.`);
console.log(`  GitHub: ${missingTags.length ? `${missingTags.length} tag(s) missing` : 'all tags'}, ${released ? 'a' : 'no'} Release.`);

const pending = { publish: missing.length > 0, align: misaligned.length > 0, tags: missingTags.length > 0, notes: !released };
if (!Object.values(pending).some(Boolean)) {
    for (const key of ['publish', 'align', 'tags', 'notes', 'release']) output(key, 'false');
    process.exit(0);
}

if (versionCommit !== head) {
    console.log(`::warning::${version} is not fully released, and ${head.slice(0, 8)} is not its version commit, so it releases nothing: that would publish this commit's code under ${version}. `
        + `The release belongs to ${versionCommit ? versionCommit.slice(0, 8) : 'the version commit'}'s ci run: if it failed, re-run its release jobs, or release by hand (CONTRIBUTING → Releasing).`);
    for (const key of ['publish', 'align', 'tags', 'notes', 'release']) output(key, 'false');
    process.exit(0);
}

const beta = (await json('https://registry.npmjs.org/-/package/@aparte%2Fcore/dist-tags'))?.beta;
if (beta && lower(version, beta)) fail(`${version} is below the ${beta} npm serves as beta: releasing it would move beta and latest backwards.`);

for (const [key, value] of Object.entries(pending)) output(key, String(value));
output('release', 'true');
