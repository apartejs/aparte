/*
 * Creates the umbrella tag for a release: `v<version>`.
 *
 * `changeset publish` already tags each package (`@aparte/core@0.4.0-alpha.0`, ×15)
 * — useful for archaeology, useless as a release anchor. Since every `@aparte/*`
 * package ships at one version (`fixed` in .changeset/config.json), the release
 * itself has a single identity, and that is what the GitHub Release hangs off:
 * pushing `v<version>` triggers .github/workflows/release-notes.yml, which turns
 * the matching root-CHANGELOG section into the Release body.
 *
 * Deliberately does NOT push: pushing is the maintainer's trigger, as everywhere
 * else in this repo. It prints the command instead.
 *
 * Run: `node scripts/tag-release.mjs` — the last step of `pnpm release`.
 *
 * `--packages` also creates every missing `@aparte/<pkg>@<version>` tag, as `changeset
 * publish` would have: it tags only what it published in that run, so a release finished
 * by a rerun (`release.yml`) would otherwise lose the tags of the packages that went out
 * the first time.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishable } from './publishable.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'));
const tag = `v${version}`;

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

if (process.argv.includes('--packages')) {
    for (const pkg of publishable(root)) {
        const name = `${pkg.name}@${pkg.version}`;
        if (git('tag', '--list', name) === name) continue;
        git('tag', '-a', name, '-m', name);
        console.log(`[tag-release] created ${name}`);
    }
}

const existing = git('tag', '--list', tag);
if (existing === tag) {
    console.log(`[tag-release] ${tag} already exists — nothing to do.`);
} else {
    git('tag', '-a', tag, '-m', `aparté ${version}`);
    console.log(`[tag-release] created ${tag}`);
}

const onRemote = git('ls-remote', '--tags', 'origin', tag);
if (onRemote.includes(tag)) {
    console.log(`[tag-release] ${tag} is already on origin — the release notes ran (or are running).`);
} else {
    console.log('');
    console.log('Next, to publish the release notes:');
    console.log(`  git push origin ${tag}`);
    console.log('');
    console.log('That fires .github/workflows/release-notes.yml, which creates the GitHub Release');
    console.log(`from the "## ${version}" section of CHANGELOG.md.`);
    console.log('');
    console.log('Push it ALONE. GitHub drops the tag-push event past three tags in one push, so');
    console.log(`\`git push --tags\` (${publishable(root).length + 1} tags here) publishes them and triggers nothing — silently.`);
    console.log('The per-package tags can go after, in their own push.');
}
