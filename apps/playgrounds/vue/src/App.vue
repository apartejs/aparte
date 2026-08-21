<script setup lang="ts">
import { ref } from 'vue';
import { AparteChat, AparteUi, useAparteChat } from '@aparte/vue';
import { AparteConfig, DEFAULT_LOCALE } from '@aparte/core';
import { KEY_STORAGE, sendPrompt } from './aparte';

const chat = useAparteChat();

// A real control, not a decoration: switching the locale renames the bubbles live
// AND flips the reading direction, composer included. A showcase button that changed
// nothing would break the library's own rule (#8) in the library's own showcase.
const RTL_LOCALE = {
    ...DEFAULT_LOCALE,
    direction: 'rtl' as const,
    roleNameUser: 'أنت',
    roleNameAssistant: 'المساعد',
};
const rtl = ref(false);
function toggleLocale(): void {
    rtl.value = !rtl.value;
    if (rtl.value) AparteConfig.setLocale(RTL_LOCALE);
    else AparteConfig.resetLocale();
}
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
            attachments
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
            <template #toolbar>
                <!-- Two children, and the placement is the DOM order: the second one carries
                     margin-inline-start:auto, which pushes it -- logically, so it follows
                     the reading direction -- to the end of the row. -->
                <button class="chip" @click="toggleLocale">{{ rtl ? 'English' : 'العربية' }}</button>
                <AparteUi name="aparte-model-selector" :props="{ 'auto-select': true, persist: true, searchable: true, style: 'margin-inline-start:auto' }" />
            </template>
        </AparteChat>
    </div>
</template>
