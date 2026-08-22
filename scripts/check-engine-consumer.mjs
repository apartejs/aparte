/**
 * The `streamRunner` seam must have a real in-repo consumer.
 *
 * `@aparte/engine`'s whole purpose is to be injected into core through
 * `streamRunner`. Nothing in this repo ever made that assignment: the seam's unit
 * test builds its own runner, and the parity suite drives both loops from a
 * scripted transport. So the actual composition had no compile coverage and no
 * end-to-end coverage — and it shipped BROKEN, on five docs pages and a README,
 * because the two packages' message types had drifted apart.
 *
 * Ratified decision #7 already states the rule ("a layer with no in-repo consumer
 * is a contract maintained for nobody"); engine is the package it should have
 * caught. The vanilla playground now wires the runner, which makes its entire
 * Playwright suite the engine's end-to-end coverage.
 *
 * This guard exists because that coverage is invisible: remove the option and
 * every test stays green while silently going back to testing the inline loop.
 * The type guard in `stream-events.contract.ts` covers the compile half.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync } from 'node:fs';

const FILE = 'apps/playgrounds/vanilla/src/main.ts';
const src = readFileSync(FILE, 'utf8');

const importsRunner = /import\s*\{[^}]*\brunStreamAgent\b[^}]*\}\s*from\s*'@aparte\/engine'/.test(src);
const wiresRunner = /streamRunner:\s*runStreamAgent/.test(src);

if (!importsRunner || !wiresRunner) {
    console.error(
        `\n[engine-consumer] ${FILE} no longer drives @aparte/engine.\n\n`
        + `  imports runStreamAgent : ${importsRunner ? 'yes' : 'NO'}\n`
        + `  wires streamRunner     : ${wiresRunner ? 'yes' : 'NO'}\n\n`
        + 'Without this, the engine seam has no in-repo consumer: the browser suite\n'
        + 'silently goes back to exercising core\'s inline loop and every test stays\n'
        + 'green. Re-wire it, or move the consumer and update this check to match.\n',
    );
    process.exit(1);
}

console.log('[engine-consumer] OK: the vanilla playground drives runStreamAgent through the streamRunner seam.');
