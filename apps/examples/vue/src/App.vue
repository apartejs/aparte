<script setup lang="ts">
import { AparteChat, AparteUi, useAparteChat } from '@aparte/vue';
import { sendPrompt } from './aparte';

const chat = useAparteChat();

const chips = [
    { label: 'What is aparté?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
];
</script>

<template>
    <div class="app">
        <header class="topbar">
            <div class="brand">aparté <span>· vue</span></div>
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
                <AparteUi name="aparte-model-selector" :props="{ 'auto-select': true, persist: true, searchable: true, style: 'margin-inline-start:auto' }" />
            </template>
        </AparteChat>
    </div>
</template>
