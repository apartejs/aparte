/**
 * @aparte/locale-fr
 *
 * French translations for aparté. Core ships English (`DEFAULT_LOCALE`) by
 * default — pass this to `AparteConfig.setLocale(fr)` to switch.
 */

import type { AparteLocale } from '@aparte/core';

export const fr: AparteLocale = {
    inputPlaceholder: "Écrivez un message...",
    sendButton: "Envoyer",
    copy: "Copier",
    copied: "Copié !",
    retry: "Réessayer",
    thinking: "Réflexion en cours...",
    typing: "Écrit...",
    error: "Erreur",
    running: "Exécution...",
    run: "Exécuter",
    file: "Fichier",
    modelSelectorPlaceholder: "Sélectionner un modèle...",
    roleNameUser: "Vous",
    roleNameAssistant: "Assistant",
    yourMessage: "Votre message",
    assistantResponse: "Réponse de l'assistant",
    messageActions: "Actions du message",
    edit: "Modifier le message",
    editConfirm: "Envoyer",
    editCancel: "Annuler",
    feedbackPositive: "Bonne réponse",
    feedbackNegative: "Mauvaise réponse",
    previousResponse: "Réponse précédente",
    nextResponse: "Réponse suivante",
    approveTool: "Approuver",
    rejectTool: "Rejeter",
    tokensPerSecondLabel: "tok/s",
    messageInfo: "Détails",
    newChat: "Nouvelle conversation",
    deleteConversation: "Supprimer la conversation",
    archiveConversation: "Archiver la conversation",
    unarchiveConversation: "Désarchiver la conversation",
    direction: 'ltr'
};

export default fr;
