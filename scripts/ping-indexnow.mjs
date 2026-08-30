/**
 * Announce the site's URLs to IndexNow (Bing, Yandex, Naver — not Google).
 *
 * Run AFTER a deploy: `pnpm seo:indexnow`. It reads the LIVE sitemap — what is
 * announced must be what is served — verifies the key file is live first (IndexNow
 * validates `keyLocation` on its side; announcing before the key deploys would fail
 * silently later), then posts the whole URL list in one request (the protocol takes
 * up to 10,000).
 *
 * The key is public by design (it proves site ownership by being served BY the
 * site); the pair below must match `apps/docs/public/<KEY>.txt`.
 *
 * `process.exitCode` rather than `process.exit()`: an exit with fetch handles still
 * settling trips a libuv assertion on Windows (`uv_handle_closing`, async.c) — the
 * code below returns instead, and the process ends when the loop drains.
 */

const HOST = 'apartejs.dev';
const KEY = '982791edcc301f7817a894d11e71a335';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

async function main() {
    // The key file must be live before anything is announced.
    const keyRes = await fetch(KEY_LOCATION);
    const keyBody = (await keyRes.text()).trim();
    if (!keyRes.ok || keyBody !== KEY) {
        console.error(`[indexnow] FAIL: ${KEY_LOCATION} is not serving the key (status ${keyRes.status}). Deploy first, then ping.`);
        return 1;
    }

    // The deployed truth, not the local build.
    const sitemap = await (await fetch(`https://${HOST}/sitemap-0.xml`)).text();
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    // A floor, so a matcher that stopped matching cannot read as a pass.
    if (urls.length < 25) {
        console.error(`[indexnow] FAIL: only ${urls.length} URLs parsed from the live sitemap — the sitemap moved or the matcher broke.`);
        return 1;
    }

    const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls }),
    });

    // 200 = accepted; 202 = accepted, key validation pending. Anything else is a real answer to read.
    if (res.status === 200 || res.status === 202) {
        console.log(`[indexnow] OK: ${urls.length} URLs announced (HTTP ${res.status}).`);
        return 0;
    }
    console.error(`[indexnow] FAIL: HTTP ${res.status} — ${await res.text()}`);
    return 1;
}

process.exitCode = await main();
