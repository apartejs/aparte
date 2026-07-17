<script setup lang="ts">
import { ref } from 'vue';
import { AparteChat, AparteUi, useAparteChat } from '@aparte/vue';
import { KEY_STORAGE, sendPrompt } from './aparte';

const chat = useAparteChat();
const apiKey = ref(localStorage.getItem(KEY_STORAGE) ?? '');

const chips = [
    { label: 'What is aparté?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
];

function onKeyChange() {
    const value = apiKey.value.trim();
    if (value) localStorage.setItem(KEY_STORAGE, value);
    else localStorage.removeItem(KEY_STORAGE);
}
</script>

<template>
    <div class="app">
        <header class="topbar">
            <div class="brand">aparté <span>· vue</span></div>
            <input
                class="key"
                type="password"
                autocomplete="off"
                :spellcheck="false"
                placeholder="OpenRouter API key — optional, stays in your browser"
                v-model="apiKey"
                @change="onKeyChange"
            />
        </header>

        <AparteChat
            :ref="chat.chatRef"
            :messages="chat.messages.value"
            @messages-change="chat.onMessagesChange"
            center-when-empty
            placeholder="Ask anything…"
        >
            <template #empty-state>
                <div class="welcome">
                    <h2>Start a conversation</h2>
                    <div class="suggestions">
                        <button v-for="c in chips" :key="c.label" class="chip" @click="sendPrompt(c.prompt)">
                            {{ c.label }}
                        </button>
                    </div>
                </div>
            </template>
            <template #footer-right>
                <AparteUi name="aparte-model-selector" :props="{ 'auto-select': true, persist: true, searchable: true }" />
            </template>
        </AparteChat>
    </div>
</template>
