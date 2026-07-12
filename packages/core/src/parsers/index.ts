export { AparteStreamParser, parseMarkdownToSegments, deriveArtifactKind } from './aparte-stream-parser.js';
export type { AparteStreamParserOptions, AparteThinkingDelimiterPair, AparteParserState, AparteParserResult } from './aparte-stream-parser.js';

// NB: the vendor stream parsers retired with their packages (providers
// rework): parseOpenAIStream lives on as @aparte/provider-openai-compat's
// parseOpenAICompatStream; anthropic/gemini ride the AI SDK bridge
// (@aparte/provider-ai-sdk); ollama is served via its OpenAI-compat /v1.
// Core keeps only the Aparte-native NDJSON parser (BackendTransport's wire).
export { parseAparteEventStream } from './aparte-event-stream.js';
