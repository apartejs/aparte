/**
 * The Assistant template's behaviour: a scripted model behind the real client, Markdown, the
 * conversation list, and the three modes (src/templates/runtime.ts).
 */
import { aparteGlobalConfig, AparteClient, AparteDirectTransport } from '@aparte/core';
import { setupMarkedProvider } from '@aparte/plugin-marked';
import { setupStreamingMarkdownProvider } from '@aparte/plugin-streaming-markdown';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { followTheme, templateMode, typeAndSend, whenShown } from '../runtime';
import { HISTORY, PLAY_QUESTION, SCENARIOS, SEED } from './scenario';

followTheme();

// Markdown before anything renders: a bubble drawn before its renderer is set keeps its raw text.
setupMarkedProvider();
setupStreamingMarkdownProvider();

const model = createScenarioProvider({
    id: 'assistant',
    name: 'Assistant',
    scenarios: SCENARIOS,
    models: [{ id: 'assistant-large', name: 'Large', contextWindow: 128000, capabilities: ['streaming'] }],
});
aparteGlobalConfig.registerAIProvider(model);
aparteGlobalConfig.setModelConfig({ defaultProvider: model.id, defaultModel: 'assistant-large' });
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
new AparteClient().start();

// The model picker is defined only now, once the model is registered: it reads the providers when
// it mounts. A dynamic import, because a bundler evaluates a static one before this module's body
// whatever the order it is written in — measured: the picker mounted with no model to list.
void import('@aparte/plugin-model-selector');

type Viewport = HTMLElement & { setMessages(messages: typeof SEED): void };
type Composer = HTMLElement & { setValue(value: string): void; submit(): void };

const list = document.querySelector<HTMLElement & { conversations: typeof HISTORY }>('aparte-conversation-list');
if (list) list.conversations = HISTORY;

const viewport = document.querySelector<Viewport>('aparte-chat-viewport');
const composer = document.querySelector<Composer>('aparte-composer');
const mode = templateMode();

if (mode === 'thumb') {
    // The tile shows the finished conversation at once.
    viewport?.setMessages(SEED);
} else if (mode === 'play' && composer) {
    whenShown(() => void typeAndSend(composer, PLAY_QUESTION));
}
