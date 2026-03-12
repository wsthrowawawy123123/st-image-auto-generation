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
        promptMaxTokens: 120,
        promptTemperature: 0.4,

        classifierUseSeparateBackend: false,
        classifierBackend: 'kobold',
        classifierEndpoint: 'http://localhost:5001/v1/chat/completions',
        classifierApiKey: '',
        classifierModel: '',
        classifierMaxTokens: 8,
        classifierTemperature: 0.1,

        includeLastUserMessage: true,
        includePreviousAssistantMessage: false,

        triggerProbabilities: {
            nsfw: 1.0,
            selfie: 1.0,
            food: 0.95,
            location: 0.9,
            interaction: 0.7,
            scene: 0.5
        },
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

        $('#llm_analysis_classifier_separate').prop(
            'checked',
            extension_settings[extensionName].llmAnalysis.classifierUseSeparateBackend
        );

        $('#llm_analysis_classifier_backend').val(
            extension_settings[extensionName].llmAnalysis.classifierBackend
        );

        $('#llm_analysis_classifier_endpoint').val(
            extension_settings[extensionName].llmAnalysis.classifierEndpoint
        );

        $('#llm_analysis_classifier_api_key').val(
            extension_settings[extensionName].llmAnalysis.classifierApiKey
        );

        $('#llm_analysis_classifier_model').val(
            extension_settings[extensionName].llmAnalysis.classifierModel
        );

        $('#llm_analysis_classifier_max_tokens').val(
            extension_settings[extensionName].llmAnalysis.classifierMaxTokens
        );

        $('#llm_analysis_classifier_temperature').val(
            extension_settings[extensionName].llmAnalysis.classifierTemperature
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

    $('#llm_analysis_classifier_separate').on('change', function () {
        extension_settings[extensionName].llmAnalysis.classifierUseSeparateBackend =
            $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#llm_analysis_classifier_backend').on('change', function () {
        extension_settings[extensionName].llmAnalysis.classifierBackend =
            $(this).val();
        saveSettingsDebounced();
    });

    $('#llm_analysis_classifier_endpoint').on('input', function () {
        extension_settings[extensionName].llmAnalysis.classifierEndpoint =
            $(this).val();
        saveSettingsDebounced();
    });

    $('#llm_analysis_classifier_api_key').on('input', function () {
        extension_settings[extensionName].llmAnalysis.classifierApiKey =
            $(this).val();
        saveSettingsDebounced();
    });

    $('#llm_analysis_classifier_model').on('input', function () {
        extension_settings[extensionName].llmAnalysis.classifierModel =
            $(this).val();
        saveSettingsDebounced();
    });

    $('#llm_analysis_classifier_max_tokens').on('input', function () {
        extension_settings[extensionName].llmAnalysis.classifierMaxTokens =
            Number($(this).val());
        saveSettingsDebounced();
    });

    $('#llm_analysis_classifier_temperature').on('input', function () {
        extension_settings[extensionName].llmAnalysis.classifierTemperature =
            Number($(this).val());
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

async function callRunpodBackend(endpoint, apiKey, model, messages, options = {}) {
    const settings = extension_settings[extensionName]?.llmAnalysis || {};

    const max_tokens =
        options.max_tokens ??
        settings.promptMaxTokens ??
        120;

    const temperature =
        options.temperature ??
        settings.promptTemperature ??
        0.4;

    const requestBody = {
        input: {
            model,
            messages,
            max_tokens,
            temperature,
        },
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Runpod chat error ${response.status}: ${text}`);
    }

    let data = await response.json();
    console.log(`[${extensionName}] Runpod raw response`, data);

    if (data?.status && data.status !== 'COMPLETED') {
        const jobId = data?.id;
        if (!jobId) {
            throw new Error('Runpod returned queued job without id');
        }

        const baseUrl = endpoint.replace(/\/runsync$/, '').replace(/\/run$/, '');
        const statusUrl = `${baseUrl}/status/${jobId}`;

        let retries = 0;
        const maxRetries = 30;

        while (retries < maxRetries) {
            await new Promise(r => setTimeout(r, 1000));

            const statusResp = await fetch(statusUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                },
            });

            if (!statusResp.ok) {
                const text = await statusResp.text();
                throw new Error(`Runpod status error ${statusResp.status}: ${text}`);
            }

            data = await statusResp.json();
            console.log(`[${extensionName}] Runpod status response`, data);

            if (data?.status === 'COMPLETED') {
                break;
            }

            if (data?.status === 'FAILED' || data?.status === 'CANCELLED' || data?.status === 'TIMED_OUT') {
                throw new Error(`Runpod job ended with status: ${data.status}`);
            }

            retries++;
        }

        if (data?.status !== 'COMPLETED') {
            throw new Error('Runpod job did not complete in time');
        }
    }

    const tokens = data?.output?.[0]?.choices?.[0]?.tokens;
    if (Array.isArray(tokens)) {
        return tokens.join('').trim();
    }

    const content = data?.output?.[0]?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
        return content.trim();
    }

    const text = data?.output?.[0]?.choices?.[0]?.text;
    if (typeof text === 'string') {
        return text.trim();
    }

    console.warn(`[${extensionName}] Runpod completed without parseable output`, data);
    return '';
}

async function callKoboldBackend(endpoint, apiKey, model, messages, options = {}) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
            ...(model ? { model } : {}),
            messages,
            max_tokens: options.max_tokens ?? 8,
            temperature: options.temperature ?? 0.1,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Kobold chat error ${response.status}: ${text}`);
    }

    const data = await response.json();

    return (
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        ''
    ).trim();
}

async function callChat(messages, options = {}) {
    const settings = extension_settings[extensionName]?.llmAnalysis || {};

    const useClassifierBackend = options.useClassifierBackend === true;

    const backend = useClassifierBackend
        ? (settings.classifierBackend || 'kobold')
        : 'runpod';

    const endpoint = useClassifierBackend
        ? (settings.classifierEndpoint || settings.endpoint)
        : settings.endpoint;

    const apiKey = useClassifierBackend
        ? (settings.classifierApiKey || settings.apiKey)
        : settings.apiKey;

    const model = useClassifierBackend
        ? (settings.classifierModel || settings.model)
        : settings.model;

    if (!endpoint) {
        throw new Error(`Missing endpoint for backend: ${backend}`);
    }

    if (backend === 'runpod') {
        return await callRunpodBackend(endpoint, apiKey, model, messages, options);
    }

    if (backend === 'kobold') {
        return await callKoboldBackend(endpoint, apiKey, model, messages, options);
    }

    throw new Error(`Unsupported backend: ${backend}`);
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

    const classifierPrompt = `Determine whether the CURRENT assistant reply contains visible narration that could be illustrated with an image.

    Text between *asterisks* represents visible narration.

    Classify primarily based on the CURRENT assistant reply.
    Use Recent user context and Previous assistant context only to resolve ambiguity, not as standalone reasons to answer YES.

    Return YES if the CURRENT assistant reply contains any visible action or visible description, including:
    - body movement
    - pose change
    - facial expression
    - gesture or body language
    - interaction with objects or furniture
    - environment or lighting description
    - characters moving within a scene
    - physical or sexual interaction between characters
    - clothing or body exposure changes
    - changes in position relative to another character

    Return NO only if the CURRENT assistant reply is pure dialogue with no visible narration.

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

    const result = await callChat(
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
            useClassifierBackend: settings.classifierUseSeparateBackend === true,
            max_tokens: settings.classifierMaxTokens ?? 8,
            temperature: settings.classifierTemperature ?? 0.1,
        },
    );

    const normalized = (result || "").trim().toUpperCase();
    if (normalized.includes("YES")) return true;
    if (normalized.includes("NO")) return false;
    return false;
}

async function generateImageTagFromReply(context) {
    const settings = extension_settings[extensionName]?.llmAnalysis || {};
    const { latestAssistant, latestUser, previousAssistant } =
        getRecentContextForImageAnalysis(context);

    const assistantText = preprocessForImagePrompt(latestAssistant);
    const userText = preprocessForImagePrompt(latestUser);
    const prevAssistantText = preprocessForImagePrompt(previousAssistant);

    const promptBuilderRequest = `Select the single most visually representative moment from the CURRENT assistant reply.

        Convert that moment into concise visual tags for image generation.

        Base the tags primarily on the CURRENT assistant reply.
        Use Recent user context and Previous assistant context only to resolve ambiguity or maintain scene continuity.

        Rules:
        - comma separated
        - 1–4 words per tag
        - 6–12 tags total
        - no sentences
        - no explanations
        - no markup
        - only visible elements
        - do not invent details not clearly visible

        Perspective rule:
        If the narration addresses "you" or is written from the assistant's point of view,
        include the tag: first person perspective.
        Otherwise use third person perspective if the scene is externally observed.

        Prefer body position tags like: kneeling pose, sitting pose, leaning pose, straddling pose.

        Tag priority order:
        1. camera or perspective
        2. body position or pose
        3. facial expression or gaze
        4. clothing state or exposure
        5. physical contact or interaction
        6. environment or furniture
        7. lighting or atmosphere

        Prefer static visual states over motion verbs.

        Example output:
        first person perspective, kneeling pose, looking up, open blouse, office desk, warm lighting

        Recent user context:
        ${userText || '(none)'}

        Previous assistant context:
        ${prevAssistantText || '(none)'}

        Current assistant reply:
        ${assistantText}`;

    const sceneTags = await callChat(
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
            temperature: settings.promptTemperature ?? 0.2,
        },
    );

   return sceneTags.trim().replace(/^["']|["']$/g, '');
}

function detectTriggerType(context) {
    const { latestAssistant, latestUser } =
        getRecentContextForImageAnalysis(context);

    const text = `${latestUser} ${latestAssistant}`.toLowerCase();

    if (/selfie|send.*pic|send.*photo|take.*picture|show.*picture/.test(text)) {
        return "selfie";
    }

    if (/kiss|sex|naked|moan|thrust|straddle|cum|climax/.test(text)) {
        return "nsfw";
    }

    if (/eat|food|plate|meal|drink|coffee|restaurant|pizza|burger/.test(text)) {
        return "food";
    }

    if (/walks? into|enter|arrive|restaurant|office|room|door/.test(text)) {
        return "location";
    }

    if (/touch|grabs|holds|pulls|pushes|leans/.test(text)) {
        return "interaction";
    }

    if (Math.random() < 0.15) return "scene";
    return "none";
}

function shouldGenerateForTrigger(triggerType) {
    const probs =
        extension_settings[extensionName]?.triggerProbabilities || {};

    const chance = probs[triggerType] ?? 0.4;

    return Math.random() <= chance;
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

        const triggerType = detectTriggerType(context);

        console.log(`[${extensionName}] trigger detected`, triggerType);

        // Always generate selfies
        if (triggerType === "selfie") {
            shouldGenerateImage = true;
        } else {
            const classifierResult = await classifyReplyForImage(context);

            if (!classifierResult) {
                return;
            }

            shouldGenerateImage = shouldGenerateForTrigger(triggerType);
        }

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