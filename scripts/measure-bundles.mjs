/**
 * How much JavaScript a browser downloads to start a working chat: aparté and four other
 * libraries, measured the same way, so the home page can print one honest chart.
 *
 * "A working chat" is the same for everyone: a chat that streams a model's reply into the
 * library's own default UI, set up the way its documentation's quickstart says. A server, where a
 * library needs one, is not counted — only what the page downloads.
 *
 * The method, identical for every library:
 * - installed from npm into a throwaway folder, every package pinned, and every transitive
 *   dependency pinned too by npm's `--before` date;
 * - installed with `--ignore-scripts`: nothing a package ships is ever run, only parsed;
 * - bundled by esbuild (pinned, installed the same way): minified, ESM, browser, production
 *   React, code splitting on;
 * - the bar is what loads at startup: the entry chunk and every chunk it imports statically.
 *   Chunks a library loads on demand are reported apart, as is CSS;
 * - every file gzipped at level 9; 1 KB is 1,024 bytes;
 * - a React library's React is measured alone and shown as its own share of the bar;
 * - where a library documents another path to the same default UI (a CDN file, a lighter
 *   runtime, a fuller import), that path is measured too and printed beside the bar.
 *
 * It downloads packages (and, for assistant-ui, the source its docs copy into an app), so it is
 * run by hand, never by the gate:
 *
 *     node scripts/measure-bundles.mjs [workdir]
 *
 * and writes apps/docs/src/data/bundle-sizes.json, which the site reads at build time.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'apps/docs/src/data/bundle-sizes.json');
const WORK = resolve(process.argv[2] ?? join(tmpdir(), 'aparte-bundle-weights'));

/** Every library, aparté included, at its latest version published before this instant. */
const BEFORE = '2026-10-17T00:00:00Z';
const ESBUILD = '0.27.7';
const REACT = { react: '19.3.1', 'react-dom': '19.3.1' };

/**
 * The source assistant-ui's docs copy into an app for its <Thread/>, at the commit tagged
 * @assistant-ui/react@0.15.29: the thread.aui item and every local file it imports, resolved the
 * way the repo's own example resolves its aliases (ui/base first).
 */
const ASSISTANT_UI_COMMIT = 'a46d6634e7a75eddd85d51415b1a615886d4ad0e';
const ASSISTANT_UI_FILES = [
    'components/react/assistant-ui/elements/thread.aui.tsx',
    'components/react/assistant-ui/elements/attachment.aui.tsx',
    'components/react/assistant-ui/elements/collapsible-root.tsx',
    'components/react/assistant-ui/elements/file.tsx',
    'components/react/assistant-ui/elements/follow-up-suggestions.aui.tsx',
    'components/react/assistant-ui/elements/image.tsx',
    'components/react/assistant-ui/elements/markdown-text.tsx',
    'components/react/assistant-ui/elements/media-player.tsx',
    'components/react/assistant-ui/elements/reasoning.aui.tsx',
    'components/react/assistant-ui/elements/reasoning.tsx',
    'components/react/assistant-ui/elements/surfaces.tsx',
    'components/react/assistant-ui/elements/tool-fallback.aui.tsx',
    'components/react/assistant-ui/elements/tool-group.aui.tsx',
    'components/react/assistant-ui/elements/tooltip-icon-button.tsx',
    'components/react/assistant-ui/utils/href.ts',
    'components/react/assistant-ui/utils/useIsomorphicLayoutEffect.ts',
    'components/react/ui/base/avatar.tsx',
    'components/react/ui/base/button.tsx',
    'components/react/ui/base/dialog.tsx',
    'components/react/ui/base/skeleton.tsx',
    'components/react/ui/base/textarea.tsx',
    'components/react/ui/base/tooltip.tsx',
    'hooks/use-attachment-src.ts',
    'hooks/use-copy-to-clipboard.ts',
    'lib/utils.ts',
];

/**
 * Every library: its pinned packages, its entry as its docs write it, and one line saying what its
 * default UI holds (printed under its bar).
 */
const LIBRARIES = [
    {
        id: 'aparte',
        name: 'aparté',
        version: '0.19.2',
        packages: { '@aparte/core': '0.19.2', '@aparte/provider-openai-compat': '0.19.2', '@aparte/plugin-marked': '0.19.2', '@aparte/plugin-streaming-markdown': '0.19.2' },
        files: {
            'entry.js': `import { aparteGlobalConfig, AparteClient, AparteDirectTransport } from '@aparte/core';
import '@aparte/core/styles.css';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';

setupMarkedProvider();
setupStreamingMarkdownProvider();
aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENAI));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
new AparteClient().start();
document.body.innerHTML = '<aparte-chat></aparte-chat>';
`,
        },
        note: 'The chat with Markdown while it streams, its own client for any OpenAI-compatible API, and the agent loop with tools and approvals.',
    },
    {
        id: 'loquix',
        name: 'Loquix',
        version: '0.6.0',
        packages: { '@loquix/core': '0.6.0', lit: '3.3.3' },
        files: {
            'entry.js': `import '@loquix/core/tokens/variables.css';
import '@loquix/core/define/define-chat-container';
import '@loquix/core/define/define-chat-header';
import '@loquix/core/define/define-message-list';
import '@loquix/core/define/define-message-item';
import '@loquix/core/define/define-message-content';
import '@loquix/core/define/define-chat-composer';
import './host.js';
`,
            // Loquix ships no model client: these lines are ours, the least a streaming reply needs.
            'host.js': `document.body.innerHTML = \`
<loquix-chat-container id="chat" layout="full" mode="chat">
  <loquix-chat-header slot="header" agent-name="My Assistant"></loquix-chat-header>
  <loquix-message-list id="messages" slot="messages" auto-scroll show-scroll-anchor></loquix-message-list>
  <loquix-chat-composer id="composer" slot="composer" placeholder="Ask anything…" max-length="4000"></loquix-chat-composer>
</loquix-chat-container>\`;
const chat = document.querySelector('#chat');
const messages = document.querySelector('#messages');
const composer = document.querySelector('#composer');
const history = [];
function appendMessage(sender, text, status = 'complete') {
  const message = document.createElement('loquix-message-item');
  message.setAttribute('sender', sender);
  message.setAttribute('status', status);
  const content = document.createElement('loquix-message-content');
  content.textContent = text;
  message.append(content);
  messages.append(message);
  return { message, content };
}
chat.addEventListener('loquix-submit', async (event) => {
  const { content } = event.detail;
  appendMessage('user', content);
  history.push({ role: 'user', content });
  composer.streaming = true;
  const { message, content: out } = appendMessage('assistant', '', 'streaming');
  out.streaming = true;
  let text = '';
  try {
    const res = await fetch('https://example.invalid/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'my-model', stream: true, messages: history }),
    });
    if (!res.ok) throw new Error('Request failed');
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const data = line.startsWith('data: ') ? line.slice(6) : '';
        if (!data || data === '[DONE]') continue;
        text += JSON.parse(data).choices[0]?.delta?.content ?? '';
        out.textContent = text;
      }
    }
    history.push({ role: 'assistant', content: text });
  } catch {
    out.textContent = 'Something went wrong. Please try again.';
  } finally {
    out.streaming = false;
    message.setAttribute('status', 'complete');
    composer.streaming = false;
  }
});
`,
        },
        note: 'Presentational components: the six its Quick Start imports and the token sheet, plus about 50 lines of ours to stream a reply, since it ships no model client; replies are plain text.',
        variants: [
            {
                label: 'the full import its README shows',
                files: { 'entry-readme.js': `import '@loquix/core/tokens/variables.css';\nimport '@loquix/core';\nimport './host.js';\n` },
            },
        ],
    },
    {
        id: 'deep-chat',
        name: 'Deep Chat',
        version: '2.5.1',
        packages: { 'deep-chat': '2.5.1' },
        files: {
            'entry.js': `import 'deep-chat';

const chat = document.createElement('deep-chat');
chat.directConnection = {
  openAI: { key: 'placeholder-key', chat: { model: 'placeholder-model', custom_base_url: 'https://example.invalid/v1/' } },
};
chat.connect = { stream: true };
document.body.appendChild(chat);
`,
        },
        note: 'One element with its own clients for 24 AI services (OpenAI, Claude, Gemini, Ollama…), Markdown and tool calls; its styles are inside its JavaScript.',
        variants: [{ label: 'the CDN script its docs also list, served as it ships', prebuilt: 'deep-chat/dist/deepChat.bundle.js' }],
    },
    {
        id: 'assistant-ui',
        name: 'assistant-ui',
        version: '0.15.29',
        framework: 'react',
        packages: {
            '@assistant-ui/react': '0.15.29',
            '@assistant-ui/ai-sdk': '0.0.13',
            '@assistant-ui/react-markdown': '0.14.23',
            ai: '7.0.142',
            '@base-ui/react': '1.9.0',
            'lucide-react': '1.58.0',
            cn: '0.4.0',
            'class-variance-authority': '0.7.1',
            'remark-gfm': '4.0.1',
            zustand: '5.0.15',
        },
        source: { repo: 'assistant-ui/assistant-ui', commit: ASSISTANT_UI_COMMIT, base: 'packages/ui/src/', files: ASSISTANT_UI_FILES, into: 'ui' },
        files: {
            'tsconfig.json': JSON.stringify({
                compilerOptions: {
                    baseUrl: '.',
                    jsx: 'react-jsx',
                    paths: {
                        '@/components/assistant-ui/*': ['./ui/components/react/assistant-ui/*'],
                        '@/hooks/*': ['./ui/hooks/*'],
                        '@/components/ui/*': ['./ui/components/react/ui/base/*', './ui/components/react/ui/radix/*'],
                        '@/components/ui/radix/*': ['./ui/components/react/ui/radix/*'],
                        '@/lib/utils': ['./ui/lib/utils'],
                    },
                },
            }),
            'entry.tsx': `import { createRoot } from 'react-dom/client';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/ai-sdk';
import { Thread } from '@/components/assistant-ui/elements/thread.aui';

function App() {
  const runtime = useChatRuntime({ transport: new AssistantChatTransport({ api: '/api/chat' }) });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-dvh"><Thread /></div>
    </AssistantRuntimeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
`,
        },
        note: 'The AI SDK runtime and the Thread its docs copy into your app: Markdown, tool calls, attachments; the model is called from your server, and its CSS is your Tailwind build’s output.',
        // Its styles are Tailwind classes your own build turns into CSS: not this library's file to weigh.
        cssFromApp: true,
        variants: [
            {
                label: 'its LocalRuntime with an adapter you write, in place of the AI SDK',
                files: {
                    'entry-local.tsx': `import { createRoot } from 'react-dom/client';
import { AssistantRuntimeProvider, useLocalRuntime, type ChatModelAdapter } from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/elements/thread.aui';

const adapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const res = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ messages }), signal: abortSignal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      yield { content: [{ type: 'text', text }] };
    }
  },
};

function App() {
  const runtime = useLocalRuntime(adapter);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-dvh"><Thread /></div>
    </AssistantRuntimeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
`,
                },
            },
        ],
    },
    {
        id: 'copilotkit',
        name: 'CopilotKit',
        version: '1.79.1',
        framework: 'react',
        packages: { '@copilotkit/react-core': '1.79.1', '@copilotkit/react-ui': '1.79.1', zod: '4.6.7' },
        files: {
            'entry.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import { CopilotKitProvider, CopilotChat } from '@copilotkit/react-core/v2';
import '@copilotkit/react-core/v2/styles.css';

function App() {
  return (
    <CopilotKitProvider runtimeUrl="http://localhost:8200/api/copilotkit">
      <div style={{ height: '100vh' }}><CopilotChat /></div>
    </CopilotKitProvider>
  );
}

const root = document.createElement('div');
document.body.appendChild(root);
ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
`,
        },
        note: 'Its documented React chat: Markdown, math, code highlighting, tool calls and generative UI; its runtime runs on a server and is not counted.',
    },
];

function install(dir, packages, before) {
    const manifest = JSON.stringify({ private: true, dependencies: packages, before }, null, 2);
    // A folder already installed with the same manifest is reused: the pins make it identical.
    if (existsSync(join(dir, 'node_modules')) && existsSync(join(dir, 'package.json')) && readFileSync(join(dir, 'package.json'), 'utf8') === manifest) return;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), manifest);
    execFileSync('npm', ['install', '--prefix', dir, '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', `--before=${before}`], {
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });
}

async function fetchSource({ repo, commit, base, files, into }, srcDir) {
    for (const file of files) {
        const res = await fetch(`https://raw.githubusercontent.com/${repo}/${commit}/${base}${file}`);
        if (!res.ok) throw new Error(`[measure-bundles] ${res.status} fetching ${repo}@${commit} ${file}`);
        const target = join(srcDir, into, file);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, await res.text());
    }
}

/** Bundles one entry and returns what loads at startup, what loads later, and the CSS. */
async function measure(esbuild, pkgDir, srcDir, entryFile) {
    const result = await esbuild.build({
        absWorkingDir: srcDir,
        entryPoints: [join(srcDir, entryFile)],
        bundle: true,
        splitting: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"production"' },
        nodePaths: [join(pkgDir, 'node_modules')],
        loader: { '.css': 'css', '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' },
        outdir: join(srcDir, 'out'),
        metafile: true,
        write: false,
        logLevel: 'error',
    });
    const gzipOf = new Map(result.outputFiles.map((f) => [resolve(f.path), gzipSync(Buffer.from(f.contents), { level: 9 }).length]));
    const outputs = Object.entries(result.metafile.outputs).map(([key, info]) => ({ path: resolve(srcDir, key), info }));
    // Matched by name: with splitting, esbuild marks every dynamic import() target as an entry
    // point too, and the first of those is not the page's entry.
    const entry = outputs.find((o) => o.path.endsWith('.js') && o.info.entryPoint?.split('\\').join('/') === entryFile);
    if (!entry) throw new Error(`[measure-bundles] no entry chunk for ${entryFile}`);
    // The startup closure: the entry chunk, then every chunk reached through a static import.
    const startup = new Set([entry.path]);
    const queue = [entry];
    while (queue.length) {
        const out = queue.shift();
        for (const imported of out.info.imports) {
            if (imported.kind !== 'import-statement' || imported.external) continue;
            const target = outputs.find((o) => o.path === resolve(srcDir, imported.path));
            if (target && !startup.has(target.path)) {
                startup.add(target.path);
                queue.push(target);
            }
        }
    }
    const js = outputs.filter((o) => o.path.endsWith('.js'));
    const sum = (list) => list.reduce((total, o) => total + (gzipOf.get(o.path) ?? 0), 0);
    const css = entry.info.cssBundle ? (gzipOf.get(resolve(srcDir, entry.info.cssBundle)) ?? 0) : 0;
    return { startup: sum(js.filter((o) => startup.has(o.path))), later: sum(js.filter((o) => !startup.has(o.path))), css };
}

mkdirSync(WORK, { recursive: true });
const toolDir = join(WORK, 'esbuild');
install(toolDir, { esbuild: ESBUILD }, BEFORE);
const esbuild = createRequire(join(toolDir, 'package.json'))('esbuild');

// React on its own: the share a React library's bar owes to the framework.
const reactDir = join(WORK, 'react');
install(join(reactDir, 'pkg'), REACT, BEFORE);
mkdirSync(join(reactDir, 'src'), { recursive: true });
writeFileSync(join(reactDir, 'src', 'entry.jsx'), `import { createRoot } from 'react-dom/client';\ncreateRoot(document.body).render(null);\n`);
const reactOnly = await measure(esbuild, join(reactDir, 'pkg'), join(reactDir, 'src'), 'entry.jsx');
console.log(`[measure-bundles] React alone: ${reactOnly.startup} B`);

const rows = [];
for (const lib of LIBRARIES) {
    const dir = join(WORK, lib.id);
    const packages = lib.framework === 'react' ? { ...REACT, ...lib.packages } : lib.packages;
    install(join(dir, 'pkg'), packages, BEFORE);
    const srcDir = join(dir, 'src');
    rmSync(srcDir, { recursive: true, force: true });
    mkdirSync(srcDir, { recursive: true });
    for (const [file, text] of Object.entries(lib.files)) writeFileSync(join(srcDir, file), text);
    if (lib.source) await fetchSource(lib.source, srcDir);
    const entryFile = Object.keys(lib.files).find((file) => file.startsWith('entry.'));
    const size = await measure(esbuild, join(dir, 'pkg'), srcDir, entryFile);
    const framework = lib.framework === 'react' ? reactOnly.startup : 0;
    // Other official paths to the same default UI, printed beside the bar: an entry of its own,
    // measured the same way, or a file the library ships ready to serve, gzipped as it is.
    const variants = [];
    for (const variant of lib.variants ?? []) {
        let startup;
        if (variant.prebuilt) {
            startup = gzipSync(readFileSync(join(dir, 'pkg', 'node_modules', variant.prebuilt)), { level: 9 }).length;
        } else {
            for (const [file, text] of Object.entries(variant.files)) writeFileSync(join(srcDir, file), text);
            startup = (await measure(esbuild, join(dir, 'pkg'), srcDir, Object.keys(variant.files)[0])).startup;
        }
        variants.push({ label: variant.label, startupGzip: startup, ownGzip: startup - framework });
        console.log(`[measure-bundles]   ${lib.name}, ${variant.label}: ${startup} B`);
    }
    rows.push({
        id: lib.id,
        name: lib.name,
        version: lib.version,
        packages,
        startupGzip: size.startup,
        frameworkGzip: framework,
        ownGzip: size.startup - framework,
        laterGzip: size.later,
        cssGzip: lib.cssFromApp ? null : size.css,
        note: lib.note,
        variants,
    });
    console.log(`[measure-bundles] ${lib.name} ${lib.version}: ${size.startup} B at startup (${framework} B React), ${size.later} B on demand, ${size.css} B css`);
}

writeFileSync(
    OUT,
    `${JSON.stringify(
        {
            measuredOn: new Date().toISOString().slice(0, 10),
            before: BEFORE,
            esbuild: ESBUILD,
            gzipLevel: 9,
            react: REACT,
            reactGzip: reactOnly.startup,
            libraries: rows,
        },
        null,
        2,
    )}\n`,
);
console.log(`[measure-bundles] wrote ${OUT}`);
