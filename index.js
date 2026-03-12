// The main script for the extension
// The following are examples of some basic extension functionality

// You'll likely need to import extension_settings and getContext from extensions.js
import { extension_settings, getContext } from '../../../extensions.js';
// You'll likely need to import some other functions from the main script
import {
    saveSettingsDebounced,
    eventSource,
    event_types,
    updateMessageBlock,
} from '../../../../script.js';
import { appendMediaToMessage } from '../../../../script.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';

// Extension name and path
const extensionName = 'st-image-auto-generation';
// /scripts/extensions/third-party
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

// Insert type constants
const INSERT_TYPE = {
    DISABLED: 'disabled',
    INLINE: 'inline',
    NEW_MESSAGE: 'new',
    REPLACE: 'replace',
};

let isImageAnalysisCall = false;

/**
 * Escapes characters for safe inclusion inside HTML attribute values.
 * @param {string} value
 * @returns {string}
 */
function escapeHtmlAttribute(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Default settings
const defaultSettings = {
    insertType: INSERT_TYPE.DISABLED,
    promptInjection: {
        enabled: true,
        prompt: `<image_generation>
You must insert a <pic prompt="example prompt"> at end of the reply. Prompts are used for stable diffusion image generation, based on the plot and character to output appropriate prompts to generate captivating images.
</image_generation>`,
        regex: '/<pic[^>]*\\sprompt="([^"]*)"[^>]*?>/g',
        position: 'deep_system', // deep_system, deep_user, deep_assistant
        depth: 0, // 0 means append to the end, >0 means insert relative to the end
    },
    llmAnalysis: {
        enabled: true,
        endpoint: '',
        apiKey: '',
        model: 'thedrummer/cydonia-24b-v4.3',
        classifierMaxTokens: 8,
        promptMaxTokens: 120,
        classifierTemperature: 0.1,
        promptTemperature: 0.4,
        includeLastUserMessage: true,
        includePreviousAssistantMessage: false,
    },
};

// Update UI from settings
function updateUI() {
    // Toggle extension button state based on insertType
    $('#auto_generation').toggleClass(
        'selected',
        extension_settings[extensionName].insertType !== INSERT_TYPE.DISABLED,
    );

    // Only update form elements if they exist
        if ($('#image_generation_insert_type').length) {
        $('#image_generation_insert_type').val(
            extension_settings[extensionName].insertType,
        );
        $('#prompt_injection_enabled').prop(
            'checked',
            extension_settings[extensionName].promptInjection.enabled,
        );
        $('#prompt_injection_text').val(
            extension_settings[extensionName].promptInjection.prompt,
        );
        $('#prompt_injection_position').val(
            extension_settings[extensionName].promptInjection.position,
        );
        $('#prompt_injection_depth').val(
            extension_settings[extensionName].promptInjection.depth,
        );

        $('#llm_analysis_enabled').prop(
            'checked',
            extension_settings[extensionName].llmAnalysis.enabled,
        );
        $('#llm_analysis_endpoint').val(
            extension_settings[extensionName].llmAnalysis.endpoint,
        );
        $('#llm_analysis_api_key').val(
            extension_settings[extensionName].llmAnalysis.apiKey,
        );
        $('#llm_analysis_model').val(
            extension_settings[extensionName].llmAnalysis.model,
        );
    }
}

// Load settings
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    // If settings are empty or missing required properties, use defaults
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    } else {
        // Ensure promptInjection object exists
        if (!extension_settings[extensionName].promptInjection) {
            extension_settings[extensionName].promptInjection =
                defaultSettings.promptInjection;
        } else {
            // Ensure all promptInjection sub-properties exist
            const defaultPromptInjection = defaultSettings.promptInjection;
            for (const key in defaultPromptInjection) {
                if (
                    extension_settings[extensionName].promptInjection[key] ===
                    undefined
                ) {
                    extension_settings[extensionName].promptInjection[key] =
                        defaultPromptInjection[key];
                }
            }
        }

        // Ensure llmAnalysis object exists
        if (!extension_settings[extensionName].llmAnalysis) {
            extension_settings[extensionName].llmAnalysis =
                defaultSettings.llmAnalysis;
        } else {
            // Ensure all llmAnalysis sub-properties exist
            const defaultLlmAnalysis = defaultSettings.llmAnalysis;
            for (const key in defaultLlmAnalysis) {
                if (
                    extension_settings[extensionName].llmAnalysis[key] ===
                    undefined
                ) {
                    extension_settings[extensionName].llmAnalysis[key] =
                        defaultLlmAnalysis[key];
                }
            }
        }

        // Ensure insertType property exists
        if (extension_settings[extensionName].insertType === undefined) {
            extension_settings[extensionName].insertType =
                defaultSettings.insertType;
        }
    }

    updateUI();
}

// Create settings panel
async function createSettings(settingsHtml) {
    // Create container for extension settings if it doesn't exist
    if (!$('#image_auto_generation_container').length) {
        $('#extensions_settings2').append(
            '<div id="image_auto_generation_container" class="extension_container"></div>',
        );
    }

    // Use provided settingsHtml instead of fetching again
    $('#image_auto_generation_container').empty().append(settingsHtml);

    // Add event handlers for settings changes
    $('#image_generation_insert_type').on('change', function () {
        const newValue = $(this).val();
        extension_settings[extensionName].insertType = newValue;
        updateUI();
        saveSettingsDebounced();
    });

    // Event handlers for prompt injection settings
    $('#prompt_injection_enabled').on('change', function () {
        extension_settings[extensionName].promptInjection.enabled =
            $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#prompt_injection_text').on('input', function () {
        extension_settings[extensionName].promptInjection.prompt =
            $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_position').on('change', function () {
        extension_settings[extensionName].promptInjection.position =
            $(this).val();
        saveSettingsDebounced();
    });

    // Depth setting handler
    $('#prompt_injection_depth').on('input', function () {
        const value = parseInt(String($(this).val()));
        extension_settings[extensionName].promptInjection.depth = isNaN(value)
            ? 0
            : value;
        saveSettingsDebounced();
    });

        $('#llm_analysis_enabled').on('change', function () {
        extension_settings[extensionName].llmAnalysis.enabled =
            $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#llm_analysis_endpoint').on('input', function () {
        extension_settings[extensionName].llmAnalysis.endpoint =
            $(this).val();
        saveSettingsDebounced();
    });

    $('#llm_analysis_api_key').on('input', function () {
        extension_settings[extensionName].llmAnalysis.apiKey =
            $(this).val();
        saveSettingsDebounced();
    });

    $('#llm_analysis_model').on('input', function () {
        extension_settings[extensionName].llmAnalysis.model =
            $(this).val();
        saveSettingsDebounced();
    });

    // Initialize UI values
    updateUI();
}

// Extension button click handler
function onExtensionButtonClick() {
    // Open extension settings panel directly
    const extensionsDrawer = $('#extensions-settings-button .drawer-toggle');

    // If the drawer is closed, open it
    if ($('#rm_extensions_block').hasClass('closedDrawer')) {
        extensionsDrawer.trigger('click');
    }

    // After drawer opens, scroll to our settings container
    setTimeout(() => {
        // Find the settings container
        const container = $('#image_auto_generation_container');
        if (container.length) {
            // Scroll to the settings panel
            $('#rm_extensions_block').animate(
                {
                    scrollTop:
                        container.offset().top -
                        $('#rm_extensions_block').offset().top +
                        $('#rm_extensions_block').scrollTop(),
                },
                500,
            );

            // Use SillyTavern's native drawer expansion
            // Check if drawer content is visible
            const drawerContent = container.find('.inline-drawer-content');
            const drawerHeader = container.find('.inline-drawer-header');

            // Only trigger expansion if content is hidden
            if (drawerContent.is(':hidden') && drawerHeader.length) {
                // Trigger native click event directly
                drawerHeader.trigger('click');
            }
        }
    }, 500);
}

// Initialize extension
$(function () {
    (async function () {
        // Fetch settings HTML (only once)
        const settingsHtml = await $.get(
            `${extensionFolderPath}/settings.html`,
        );

        // Add extension button to menu
        $('#extensionsMenu')
            .append(`<div id="auto_generation" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-robot"></div>
            <span data-i18n="Image Auto Generation">Image Auto Generation</span>
        </div>`);

        // Clicking opens settings panel instead of toggling state
        $('#auto_generation').off('click').on('click', onExtensionButtonClick);

        await loadSettings();

        // Create settings panel using fetched HTML
        await createSettings(settingsHtml);

        // Ensure settings values are correct when panel is opened
        $('#extensions-settings-button').on('click', function () {
            setTimeout(() => {
                updateUI();
            }, 200);
        });
    })();
});

// Determine message role
function getMesRole() {
    // Ensure required settings exist
    if (
        !extension_settings[extensionName] ||
        !extension_settings[extensionName].promptInjection ||
        !extension_settings[extensionName].promptInjection.position
    ) {
        return 'system'; // Default role
    }

    switch (extension_settings[extensionName].promptInjection.position) {
        case 'deep_system':
            return 'system';
        case 'deep_user':
            return 'user';
        case 'deep_assistant':
            return 'assistant';
        default:
            return 'system';
    }
}

// Listen for CHAT_COMPLETION_PROMPT_READY to inject prompt
eventSource.on(
    event_types.CHAT_COMPLETION_PROMPT_READY,
    async function (eventData) {
        try {
            // Ensure settings and promptInjection exist
            if (
                !extension_settings[extensionName] ||
                !extension_settings[extensionName].promptInjection ||
                !extension_settings[extensionName].promptInjection.enabled ||
                extension_settings[extensionName].insertType ===
                INSERT_TYPE.DISABLED
            ) {
                return;
            }

            const prompt =
                extension_settings[extensionName].promptInjection.prompt;
            const depth =
                extension_settings[extensionName].promptInjection.depth || 0;
            const role = getMesRole();

            console.log(
                `[${extensionName}] Preparing prompt injection: role=${role}, depth=${depth}`,
            );
            console.log(
                `[${extensionName}] Prompt preview: ${prompt.substring(0, 50)}...`,
            );

            // Determine insertion position based on depth
            if (depth === 0) {
                // Append to end
                eventData.chat.push({ role: role, content: prompt });
                console.log(`[${extensionName}] Prompt appended to chat`);
            } else {
                // Insert relative to the end of the chat
                eventData.chat.splice(-depth, 0, {
                    role: role,
                    content: prompt,
                });
                console.log(
                    `[${extensionName}] Prompt inserted ${depth} messages from the end`,
                );
            }
        } catch (error) {
            console.error(`[${extensionName}] Prompt injection error:`, error);
            toastr.error(`Prompt injection error: ${error}`);
        }
    },
);

function analyzeImageQualification(reply) {
    const text = (reply || '').trim();
    if (!text) {
        return {
            qualifies: false,
            reasons: {
                empty: true,
                hasAsterisks: false,
                hasAction: false,
                hasDescription: false,
                hasEnvironment: false,
                veryShort: true,
                dialogueHeavy: false,
            },
        };
    }

    const hasAsterisks = /\*[^*]+\*/.test(text);

    const hasAction =
        /\b(looks|looking|leans|leaning|steps|walking|turns|turning|kneels|kneeling|smiles|smiling|blushes|reaches|pulls|stands|sits|moves|grips)\b/i.test(
            text,
        );

    const hasDescription =
        /\b(eyes|face|hair|hands|posture|expression|cheeks|body|shirt|skirt|dress)\b/i.test(
            text,
        );

    const hasEnvironment =
        /\b(room|office|bedroom|hallway|street|kitchen|window|desk|bed|couch|chair|lighting)\b/i.test(
            text,
        );

    const veryShort = text.length < 100;

    const quoteCount = (text.match(/"/g) || []).length;
    const dialogueHeavy =
        quoteCount >= 2 && !hasAsterisks && !hasAction && !hasDescription;

    const qualifies =
        (hasAsterisks || hasAction || hasDescription || hasEnvironment) &&
        !dialogueHeavy &&
        !veryShort;

    return {
        qualifies,
        reasons: {
            empty: false,
            hasAsterisks,
            hasAction,
            hasDescription,
            hasEnvironment,
            veryShort,
            dialogueHeavy,
            length: text.length,
            quoteCount,
        },
    };
}

function preprocessForImagePrompt(text) {
    let cleaned = (text || '').trim();

    // Remove quoted dialogue
    cleaned = cleaned.replace(/"[^"]*"/g, ' ');
    cleaned = cleaned.replace(/“[^”]*”/g, ' ');

    // // Normalize common POV words
    // cleaned = cleaned.replace(/\byou\b/gi, 'viewer');
    // cleaned = cleaned.replace(/\byour\b/gi, "viewer's");

    // Collapse whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

// Listen for incoming assistant messages
eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);

async function callRunpodChat(messages, options = {}) {
    const settings = extension_settings[extensionName]?.llmAnalysis;
    if (!settings?.endpoint || !settings?.model) {
        throw new Error('LLM analysis endpoint or model is not configured');
    }

    const response = await fetch(settings.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(settings.apiKey
                ? { Authorization: `Bearer ${settings.apiKey}` }
                : {}),
        },
        body: JSON.stringify({
            input: {
                model: settings.model,
                messages,
                max_tokens: options.max_tokens ?? settings.promptMaxTokens ?? 120,
                temperature:
                    options.temperature ?? settings.promptTemperature ?? 0.4,
            },
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Runpod chat error ${response.status}: ${text}`);
    }

    let data = await response.json();
    console.log(`[${extensionName}] Runpod raw response`, data);

    let retries = 0;

    while (data?.status && data.status !== 'COMPLETED' && retries < 5) {
        console.log(`[${extensionName}] waiting for Runpod job`, data.status);

        await new Promise(r => setTimeout(r, 800));

        const retry = await fetch(settings.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(settings.apiKey
                    ? { Authorization: `Bearer ${settings.apiKey}` }
                    : {}),
            },
            body: JSON.stringify({
                input: {
                    model: settings.model,
                    messages,
                    max_tokens: options.max_tokens ?? settings.promptMaxTokens ?? 120,
                    temperature:
                        options.temperature ?? settings.promptTemperature ?? 0.4,
                },
            }),
        });

        data = await retry.json();
        retries++;
    }
    const tokens = data?.output?.[0]?.choices?.[0]?.tokens;

    if (Array.isArray(tokens)) {
        return tokens.join('').trim();
    }

    return '';
}

function getRecentContextForImageAnalysis(context) {
    const settings = extension_settings[extensionName]?.llmAnalysis || {};
    const chat = context.chat || [];
    const currentIndex = chat.length - 1;

    const latestAssistant = chat[currentIndex]?.mes || '';
    const latestUser =
        settings.includeLastUserMessage && currentIndex >= 1
            ? chat[currentIndex - 1]?.mes || ''
            : '';

    const previousAssistant =
        settings.includePreviousAssistantMessage && currentIndex >= 2
            ? chat[currentIndex - 2]?.mes || ''
            : '';

    return {
        latestAssistant,
        latestUser,
        previousAssistant,
    };
}

async function classifyReplyForImage(context) {
    const settings = extension_settings[extensionName]?.llmAnalysis || {};
    const { latestAssistant, latestUser, previousAssistant } =
        getRecentContextForImageAnalysis(context);

    const assistantText = preprocessForImagePrompt(latestAssistant);
    const userText = preprocessForImagePrompt(latestUser);
    const prevAssistantText = preprocessForImagePrompt(previousAssistant);

    const classifierPrompt = `Determine whether the assistant reply contains visible narration that could be illustrated with an image.

    Text between *asterisks* represents visible narration.

    Return YES if the reply contains any visible action or description, including:
    - body movement
    - pose change
    - facial expression
    - gesture or body language
    - interaction with objects or furniture
    - environment or lighting description
    - characters moving within a scene
    - physical or sexual interaction between characters

    Return NO only if the reply is pure dialogue with no visible narration.

    Output exactly one word:
    YES
    or
    NO

    Recent user context:
    ${userText || '(none)'}

    Previous assistant context:
    ${prevAssistantText || '(none)'}

    Current assistant reply:
    ${assistantText}`;

    const result = await callRunpodChat(
        [
            {
                role: 'system',
                content: 'You classify whether narration contains visible actions. Respond only YES or NO.',
            },
            {
                role: 'user',
                content: classifierPrompt,
            },
        ],
        {
            max_tokens: settings.classifierMaxTokens ?? 8,
            temperature: settings.classifierTemperature ?? 0.1,
        },
    );

    const normalized = result.trim().toUpperCase();
    return normalized.startsWith('YES');
}

async function generateImageTagFromReply(context) {
    const settings = extension_settings[extensionName]?.llmAnalysis || {};
    const { latestAssistant, latestUser, previousAssistant } =
        getRecentContextForImageAnalysis(context);

    const assistantText = preprocessForImagePrompt(latestAssistant);
    const userText = preprocessForImagePrompt(latestUser);
    const prevAssistantText = preprocessForImagePrompt(previousAssistant);

    const promptBuilderRequest = `Select the single most visually representative moment from the assistant reply.

    Describe that moment using short visual tags only.

    Rules:
    - comma separated
    - 1–4 words per tag
    - no sentences
    - no explanations
    - no markup
    - no invented details
    - only visible elements

    Prefer static visual states over motion verbs.

    Example output:
    first person perspective, kneeling pose, looking up, open blouse, office desk, warm lighting

    Recent user context:
    ${userText || '(none)'}

    Previous assistant context:
    ${prevAssistantText || '(none)'}

    Current assistant reply:
    ${assistantText}`;

    const sceneTags = await callRunpodChat(
        [
            {
                role: 'system',
                content:
                    'You convert scene narration into concise visual tags for image generation.',
            },
            {
                role: 'user',
                content: promptBuilderRequest,
            },
        ],
        {
            max_tokens: settings.promptMaxTokens ?? 120,
            temperature: settings.promptTemperature ?? 0.4,
        },
    );

    return sceneTags.trim();
}

async function handleIncomingMessage() {
    // Prevent recursion during secondary analysis calls
    if (isImageAnalysisCall) {
        return;
    }

    // Ensure extension settings exist
    if (
        !extension_settings[extensionName] ||
        extension_settings[extensionName].insertType === INSERT_TYPE.DISABLED
    ) {
        return;
    }

    const context = getContext();
    const message = context.chat[context.chat.length - 1];

    // Ensure this is an assistant message
    if (!message || message.is_user) {
        return;
    }

    // Avoid running if LLM analysis is disabled
    if (!extension_settings[extensionName]?.llmAnalysis?.enabled) {
        return;
    }

    let shouldGenerateImage = false;

    try {
        isImageAnalysisCall = true;

        shouldGenerateImage = await classifyReplyForImage(context);

        console.log(`[${extensionName}] classifier result`, {
            shouldGenerateImage,
            preview: message.mes.slice(0, 200),
        });

    } catch (error) {
        console.error(`[${extensionName}] classifier failed`, error);
        return;
    } finally {
        isImageAnalysisCall = false;
    }

    if (!shouldGenerateImage) {
        return;
    }

    let sceneTags = '';

    try {
        isImageAnalysisCall = true;

        sceneTags = await generateImageTagFromReply(context);

        console.log(`[${extensionName}] scene builder output`, sceneTags);

    } catch (error) {
        console.error(`[${extensionName}] scene builder failed`, error);
        return;
    } finally {
        isImageAnalysisCall = false;
    }

    if (!sceneTags || !sceneTags.trim()) {
        console.warn(`[${extensionName}] empty scene tags`);
        return;
    }

    // Clean LLM output
    const prompt = sceneTags
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/\n/g, ' ')
        .trim();

    console.log(`[${extensionName}] final SD prompt`, prompt);

    const insertType = extension_settings[extensionName].insertType;

    try {

        toastr.info(`Generating image...`);

        // Run SillyTavern image generation
        // @ts-ignore
        const result = await SlashCommandParser.commands['sd'].callback(
            {
                quiet:
                    insertType === INSERT_TYPE.NEW_MESSAGE
                        ? 'false'
                        : 'true',
            },
            prompt,
        );

        if (!result) {
            console.warn(`[${extensionName}] SD returned no image`);
            return;
        }

        if (insertType === INSERT_TYPE.INLINE) {

            if (!message.extra) {
                message.extra = {};
            }

            if (!Array.isArray(message.extra.image_swipes)) {
                message.extra.image_swipes = [];
            }

            message.extra.image_swipes.push(result);
            message.extra.image = result;
            message.extra.title = prompt;
            message.extra.inline_image = true;

            const messageElement = $(
                `.mes[mesid="${context.chat.length - 1}"]`,
            );

            appendMediaToMessage(message, messageElement);

            await context.saveChat();

        }

        toastr.success(`Image generated`);

    } catch (error) {

        toastr.error(`Image generation error: ${error}`);
        console.error(`[${extensionName}] SD generation failed`, error);

    }
}