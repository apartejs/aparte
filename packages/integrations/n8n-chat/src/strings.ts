/**
 * The words of the widget's own chrome — its header, its welcome screen, its input, the
 * sentence a visitor reads when n8n fails — by language, under the names n8n's widget gives
 * them. The chat's own words (the send button, the screen-reader names) come from aparté's
 * locale for the same language, loaded when the widget mounts: a page that speaks one
 * language downloads that one.
 *
 * Nine languages, every one written left to right. The eight beyond English were written
 * without a native speaker's review, in the register `@aparte/locales` uses for each.
 */
import type { AparteLocale } from '@aparte/core';

export interface ChatStrings {
    /** The header's title. */
    title: string;
    /** The line under it; an empty string leaves it out. */
    subtitle: string;
    /** A line under the chat; an empty string leaves it out. */
    footer: string;
    /** The welcome screen's button, with `showWelcomeScreen`. */
    getStarted: string;
    /** The input's placeholder. */
    inputPlaceholder: string;
    /** The name of the header's close button. */
    closeButtonTooltip: string;
    /**
     * What the person reads when n8n cannot be reached. What to change in n8n goes to the
     * browser's console, for the page's developer.
     */
    errorUnreachable: string;
    /** What the person reads when the answer took too long. */
    errorTimeout: string;
    /** What the person reads when the workflow failed. */
    errorFailed: string;
}

interface Language {
    strings: ChatStrings;
    /** The first messages, n8n's two in this language. */
    initial: string[];
    /** aparté's locale for it; English is core's own, so it has none. */
    locale?: () => Promise<AparteLocale>;
}

const LANGUAGES: Record<string, Language> = {
    // n8n's widget's own English, word for word, so a page that switches looks the same.
    en: {
        strings: {
            title: 'Hi there! 👋',
            subtitle: "Start a chat. We're here to help you 24/7.",
            footer: '',
            getStarted: 'New Conversation',
            inputPlaceholder: 'Type your question..',
            closeButtonTooltip: 'Close chat',
            errorUnreachable: 'The assistant can’t be reached right now. Try again in a moment.',
            errorTimeout: 'The answer took too long. Try again in a moment.',
            errorFailed: 'The assistant couldn’t answer. Try again in a moment.',
        },
        initial: ['Hi there! 👋', 'My name is Nathan. How can I assist you today?'],
    },
    fr: {
        strings: {
            title: 'Bonjour ! 👋',
            subtitle: 'Démarrez une conversation. Nous sommes là pour vous aider, 24 h/24.',
            footer: '',
            getStarted: 'Nouvelle conversation',
            inputPlaceholder: 'Posez votre question…',
            closeButtonTooltip: 'Fermer le chat',
            errorUnreachable: 'L’assistant est injoignable pour le moment. Réessayez dans un instant.',
            errorTimeout: 'La réponse a pris trop de temps. Réessayez dans un instant.',
            errorFailed: 'L’assistant n’a pas pu répondre. Réessayez dans un instant.',
        },
        initial: ['Bonjour ! 👋', 'Je m’appelle Nathan. Comment puis-je vous aider ?'],
        locale: () => import('@aparte/locales/fr').then((m) => m.fr),
    },
    es: {
        strings: {
            title: '¡Hola! 👋',
            subtitle: 'Inicia una conversación. Estamos aquí para ayudarte, 24/7.',
            footer: '',
            getStarted: 'Nueva conversación',
            inputPlaceholder: 'Escribe tu pregunta…',
            closeButtonTooltip: 'Cerrar el chat',
            errorUnreachable: 'Ahora mismo no se puede contactar con el asistente. Inténtalo de nuevo en un momento.',
            errorTimeout: 'La respuesta tardó demasiado. Inténtalo de nuevo en un momento.',
            errorFailed: 'El asistente no pudo responder. Inténtalo de nuevo en un momento.',
        },
        initial: ['¡Hola! 👋', 'Me llamo Nathan. ¿En qué puedo ayudarte hoy?'],
        locale: () => import('@aparte/locales/es').then((m) => m.es),
    },
    'pt-BR': {
        strings: {
            title: 'Olá! 👋',
            subtitle: 'Comece uma conversa. Estamos aqui para ajudar, 24 horas por dia.',
            footer: '',
            getStarted: 'Nova conversa',
            inputPlaceholder: 'Digite sua pergunta…',
            closeButtonTooltip: 'Fechar o chat',
            errorUnreachable: 'Não foi possível falar com o assistente agora. Tente novamente em instantes.',
            errorTimeout: 'A resposta demorou demais. Tente novamente em instantes.',
            errorFailed: 'O assistente não conseguiu responder. Tente novamente em instantes.',
        },
        initial: ['Olá! 👋', 'Meu nome é Nathan. Como posso ajudar você hoje?'],
        locale: () => import('@aparte/locales/pt-BR').then((m) => m.ptBR),
    },
    de: {
        strings: {
            title: 'Hallo! 👋',
            subtitle: 'Starte ein Gespräch. Wir sind rund um die Uhr für dich da.',
            footer: '',
            getStarted: 'Neues Gespräch',
            inputPlaceholder: 'Stell deine Frage…',
            closeButtonTooltip: 'Chat schließen',
            errorUnreachable: 'Der Assistent ist gerade nicht erreichbar. Versuch es gleich noch einmal.',
            errorTimeout: 'Die Antwort hat zu lange gedauert. Versuch es gleich noch einmal.',
            errorFailed: 'Der Assistent konnte nicht antworten. Versuch es gleich noch einmal.',
        },
        initial: ['Hallo! 👋', 'Ich heiße Nathan. Wie kann ich dir heute helfen?'],
        locale: () => import('@aparte/locales/de').then((m) => m.de),
    },
    it: {
        strings: {
            title: 'Ciao! 👋',
            subtitle: 'Inizia una conversazione. Siamo qui per aiutarti, 24 ore su 24.',
            footer: '',
            getStarted: 'Nuova conversazione',
            inputPlaceholder: 'Scrivi la tua domanda…',
            closeButtonTooltip: 'Chiudi la chat',
            errorUnreachable: 'Al momento l’assistente non è raggiungibile. Riprova tra poco.',
            errorTimeout: 'La risposta ha richiesto troppo tempo. Riprova tra poco.',
            errorFailed: 'L’assistente non è riuscito a rispondere. Riprova tra poco.',
        },
        initial: ['Ciao! 👋', 'Mi chiamo Nathan. Come posso aiutarti oggi?'],
        locale: () => import('@aparte/locales/it').then((m) => m.it),
    },
    ru: {
        strings: {
            title: 'Здравствуйте! 👋',
            subtitle: 'Начните разговор. Мы на связи круглосуточно.',
            footer: '',
            getStarted: 'Новый разговор',
            inputPlaceholder: 'Введите ваш вопрос…',
            closeButtonTooltip: 'Закрыть чат',
            errorUnreachable: 'Сейчас не удаётся связаться с ассистентом. Попробуйте ещё раз чуть позже.',
            errorTimeout: 'Ответ занял слишком много времени. Попробуйте ещё раз чуть позже.',
            errorFailed: 'Ассистент не смог ответить. Попробуйте ещё раз чуть позже.',
        },
        initial: ['Здравствуйте! 👋', 'Меня зовут Натан. Чем могу помочь?'],
        locale: () => import('@aparte/locales/ru').then((m) => m.ru),
    },
    ja: {
        strings: {
            title: 'こんにちは！👋',
            subtitle: 'チャットを始めましょう。24時間いつでもお手伝いします。',
            footer: '',
            getStarted: '新しい会話',
            inputPlaceholder: '質問を入力してください…',
            closeButtonTooltip: 'チャットを閉じる',
            errorUnreachable: 'ただいまアシスタントに接続できません。しばらくしてからもう一度お試しください。',
            errorTimeout: '応答に時間がかかりすぎました。しばらくしてからもう一度お試しください。',
            errorFailed: 'アシスタントが応答できませんでした。しばらくしてからもう一度お試しください。',
        },
        initial: ['こんにちは！👋', 'ネイサンです。今日はどのようなご用件でしょうか？'],
        locale: () => import('@aparte/locales/ja').then((m) => m.ja),
    },
    ko: {
        strings: {
            title: '안녕하세요! 👋',
            subtitle: '대화를 시작하세요. 24시간 언제든 도와드릴게요.',
            footer: '',
            getStarted: '새 대화',
            inputPlaceholder: '질문을 입력하세요…',
            closeButtonTooltip: '채팅 닫기',
            errorUnreachable: '지금은 어시스턴트에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
            errorTimeout: '응답 시간이 너무 오래 걸렸습니다. 잠시 후 다시 시도해 주세요.',
            errorFailed: '어시스턴트가 답변하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        },
        initial: ['안녕하세요! 👋', '저는 네이선입니다. 무엇을 도와드릴까요?'],
        locale: () => import('@aparte/locales/ko').then((m) => m.ko),
    },
    'zh-CN': {
        strings: {
            title: '你好！👋',
            subtitle: '开始聊天吧。我们全天候为你服务。',
            footer: '',
            getStarted: '新对话',
            inputPlaceholder: '输入你的问题…',
            closeButtonTooltip: '关闭聊天',
            errorUnreachable: '暂时无法连接助手，请稍后再试。',
            errorTimeout: '响应时间过长，请稍后再试。',
            errorFailed: '助手未能回答，请稍后再试。',
        },
        initial: ['你好！👋', '我是 Nathan。今天有什么可以帮你的？'],
        locale: () => import('@aparte/locales/zh-CN').then((m) => m.zhCN),
    },
};

/**
 * The shipped language for a tag: the tag itself, else the one its primary subtag names
 * (`fr-CA` → `fr`, `pt` → `pt-BR`, `zh-Hans` → `zh-CN`), else English.
 */
export function shippedLanguage(tag: string): string {
    if (LANGUAGES[tag]) return tag;
    const primary = tag.split('-')[0]?.toLowerCase() ?? '';
    return Object.keys(LANGUAGES).find((key) => key.split('-')[0]?.toLowerCase() === primary) ?? 'en';
}

/** The chrome's words for a language: the built-in ones under the page's own. */
export function stringsFor(language: string, i18n: Record<string, Partial<ChatStrings>> | undefined): ChatStrings {
    return { ...LANGUAGES[shippedLanguage(language)]!.strings, ...(i18n?.[language] ?? {}) };
}

/** n8n's two first messages in a language. */
export function initialMessagesFor(language: string): string[] {
    return LANGUAGES[shippedLanguage(language)]!.initial;
}

/** Loads aparté's locale for a language, or `undefined` for English, which core holds. */
export function loadLocale(language: string): Promise<AparteLocale> | undefined {
    return LANGUAGES[shippedLanguage(language)]!.locale?.();
}
