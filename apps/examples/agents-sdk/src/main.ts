/**
 * The page: aparté, reading the agent's AG-UI stream. It knows nothing about the Agents SDK,
 * OpenAI or the model — swap the server behind `/agent` and this file stays as it is.
 *
 * `?subagents` reads a scripted run with two sub-agents instead (`/subagents`), and
 * `@aparte/plugin-subagents` gives each one its line, its conversation kept out of the reply.
 */
import '@aparte/core/styles.css';
import { AparteClient } from '@aparte/core';
import { setupSubagents } from '@aparte/plugin-subagents';
import { createAgUiRunner } from '@aparte/runner-ag-ui';

const endpoint = new URLSearchParams(location.search).has('subagents') ? '/subagents' : '/agent';
setupSubagents();
new AparteClient({ streamRunner: createAgUiRunner({ endpoint }) }).start();
