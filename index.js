// The main script for the extension
// The following are examples of some basic extension functionality

// You'll likely need to import extension_settings and getContext from extensions.js
import { extension_settings, getContext } from '../../../extensions.js';
// You'll likely need to import some other functions from the main script
import {
    saveSettingsDebounced,
    eventSource,
    event_types,
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
let lastImageGeneratedAtMessageIndex = -Infinity;
let sceneMemory = {
    location: '',
    environment: '',
    assistantPose: '',
    assistantClothing: '',
    assistantExpression: '',
    interaction: '',
    props: [],
    lighting: '',
    mood: '',
};

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
        classifierMaxTokens: 80,
        classifierTemperature: 0.1,
        includeLastUserMessage: true,
        includePreviousAssistantMessage: false,
        cooldown: {
            enabled: true,
            messages: 2,
        },
        sceneMemory: {
            enabled: true,
        },
        sceneWeighting: {
            enabled: true,
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
            extension_settings[extensionName].llmAnalysis = structuredClone(defaultSettings.llmAnalysis);
        } else {
            const llm = extension_settings[extensionName].llmAnalysis;
            const defaults = defaultSettings.llmAnalysis;

            for (const key in defaults) {
                if (llm[key] === undefined) {
                    llm[key] = structuredClone(defaults[key]);
                    continue;
                }

                if (
                    defaults[key] &&
                    typeof defaults[key] === 'object' &&
                    !Array.isArray(defaults[key]) &&
                    llm[key] &&
                    typeof llm[key] === 'object' &&
                    !Array.isArray(llm[key])
                ) {
                    for (const subKey in defaults[key]) {
                        if (llm[key][subKey] === undefined) {
                            llm[key][subKey] = structuredClone(defaults[key][subKey]);
                        }
                    }
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

function isOnImageCooldown(context) {
  const llmSettings = extension_settings[extensionName]?.llmAnalysis || {};
  const cooldown = llmSettings.cooldown || {};

  if (!cooldown.enabled) {
    return false;
  }

  const currentIndex = (context.chat || []).length - 1;
  const minMessagesBetweenImages = Number(cooldown.messages) || 0;

  return (currentIndex - lastImageGeneratedAtMessageIndex) < minMessagesBetweenImages;
}

function markImageGenerated(context) {
    const currentIndex = (context.chat || []).length - 1;
    lastImageGeneratedAtMessageIndex = currentIndex;
}

async function classifyReplyForImage(context) {
    const settings = extension_settings[extensionName]?.llmAnalysis || {};
    const { latestAssistant, latestUser, previousAssistant } =
        getRecentContextForImageAnalysis(context);

    const assistantText = preprocessForImagePrompt(latestAssistant);
    const userText = preprocessForImagePrompt(latestUser);
    const prevAssistantText = preprocessForImagePrompt(previousAssistant);

    const evaluatorPrompt = `Evaluate the CURRENT assistant reply for image generation.

        Return JSON only with this exact schema:

        {
        "generate": true,
        "category": "nsfw_action",
        "weight": 0.95
        }

        Valid categories:
        - "nsfw_action"
        - "selfie_request"
        - "location_change"
        - "food_or_object_focus"
        - "physical_interaction"
        - "pose_change"
        - "ambient_scene"
        - "dialogue_only"

        Rules:
        - Base the judgment primarily on the CURRENT assistant reply.
        - Use Recent user context and Previous assistant context only to resolve ambiguity.
        - "generate" should be false only when the reply is not visually worth illustrating.
        - "weight" must be a number between 0.0 and 1.0.
        - Sexual or intimate physical action should usually be high weight.
        - Clear requests for photos/selfies should usually be weight 1.0.
        - Major scene/location changes should usually be high weight.
        - Pure dialogue with no visible narration should be generate=false and weight=0.0.
        - Respond with JSON only. No explanation.

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
                content: 'You evaluate visual importance for image generation. Respond with JSON only.',
            },
            {
                role: 'user',
                content: evaluatorPrompt,
            },
        ],
        {
            useClassifierBackend: settings.classifierUseSeparateBackend === true,
            max_tokens: settings.classifierMaxTokens ?? 80,
            temperature: settings.classifierTemperature ?? 0.1,
        },
    );

    try {
        const parsed = JSON.parse(result);

        return {
            generate: parsed?.generate === true,
            category: typeof parsed?.category === 'string' ? parsed.category : 'dialogue_only',
            weight: Math.max(0, Math.min(1, Number(parsed?.weight) || 0)),
        };
    } catch (error) {
        console.warn(`[${extensionName}] failed to parse scene weighting JSON`, result, error);
        return {
            generate: false,
            category: 'dialogue_only',
            weight: 0,
        };
    }
}

async function extractScenePatch(context) {
    const settings = extension_settings[extensionName]?.llmAnalysis || {};
    const { latestAssistant, latestUser, previousAssistant } =
        getRecentContextForImageAnalysis(context);

    const assistantText = preprocessForImagePrompt(latestAssistant);
    const userText = preprocessForImagePrompt(latestUser);
    const prevAssistantText = preprocessForImagePrompt(previousAssistant);

    const patchPrompt = `Extract the current visual scene state update from the CURRENT assistant reply.

        Return JSON only with this exact schema:

        {
        "location": "",
        "environment": "",
        "assistantPose": "",
        "assistantClothing": "",
        "assistantExpression": "",
        "interaction": "",
        "props": [],
        "lighting": "",
        "mood": ""
        }

        Rules:
        - Only include fields that are explicitly stated or strongly implied by the CURRENT assistant reply.
        - If a field did not change or is unclear, leave it as an empty string, or [] for props.
        - Do not invent details.
        - Use Recent user context and Previous assistant context only to resolve ambiguity.
        - Respond with JSON only.

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
                content: 'You extract visual scene state updates. Respond with JSON only.',
            },
            {
                role: 'user',
                content: patchPrompt,
            },
        ],
        {
            useClassifierBackend: settings.classifierUseSeparateBackend === true,
            max_tokens: 200,
            temperature: 0.1,
        },
    );

    try {
        const parsed = JSON.parse(result);

        return {
            location: typeof parsed?.location === 'string' ? parsed.location.trim() : '',
            environment: typeof parsed?.environment === 'string' ? parsed.environment.trim() : '',
            assistantPose: typeof parsed?.assistantPose === 'string' ? parsed.assistantPose.trim() : '',
            assistantClothing: typeof parsed?.assistantClothing === 'string' ? parsed.assistantClothing.trim() : '',
            assistantExpression: typeof parsed?.assistantExpression === 'string' ? parsed.assistantExpression.trim() : '',
            interaction: typeof parsed?.interaction === 'string' ? parsed.interaction.trim() : '',
            props: Array.isArray(parsed?.props)
                ? parsed.props.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean)
                : [],
            lighting: typeof parsed?.lighting === 'string' ? parsed.lighting.trim() : '',
            mood: typeof parsed?.mood === 'string' ? parsed.mood.trim() : '',
        };
    } catch (error) {
        console.warn(`[${extensionName}] failed to parse scene patch JSON`, result, error);
        return null;
    }
}

function mergeScenePatch(patch) {
    if (!patch) {
        return;
    }

    const previousLocation = sceneMemory.location;

    if (patch.location && patch.location !== previousLocation) {
        sceneMemory.location = patch.location;
        sceneMemory.environment = patch.environment || '';
        sceneMemory.assistantPose = patch.assistantPose || '';
        sceneMemory.interaction = patch.interaction || '';
        sceneMemory.props = Array.isArray(patch.props) ? patch.props : [];
        sceneMemory.lighting = patch.lighting || '';
        sceneMemory.mood = patch.mood || '';
        if (patch.assistantClothing) {
            sceneMemory.assistantClothing = patch.assistantClothing;
        }
        if (patch.assistantExpression) {
            sceneMemory.assistantExpression = patch.assistantExpression;
        }
        return;
    }

    for (const [key, value] of Object.entries(patch)) {
        if (Array.isArray(value)) {
            if (value.length > 0) {
                sceneMemory[key] = value;
            }
            continue;
        }

        if (typeof value === 'string' && value.trim()) {
            sceneMemory[key] = value.trim();
        }
    }
}

async function generateImageTagFromReply(context) {
    const settings = extension_settings[extensionName]?.llmAnalysis || {};
    const { latestAssistant, latestUser, previousAssistant } =
        getRecentContextForImageAnalysis(context);

    const assistantText = preprocessForImagePrompt(latestAssistant);
    const userText = preprocessForImagePrompt(latestUser);
    const prevAssistantText = preprocessForImagePrompt(previousAssistant);

    const memoryBlock =
        extension_settings[extensionName]?.llmAnalysis?.sceneMemory?.enabled
            ? `Current scene memory:
                - location: ${sceneMemory.location || '(unknown)'}
                - environment: ${sceneMemory.environment || '(unknown)'}
                - assistant pose: ${sceneMemory.assistantPose || '(unknown)'}
                - assistant clothing: ${sceneMemory.assistantClothing || '(unknown)'}
                - assistant expression: ${sceneMemory.assistantExpression || '(unknown)'}
                - interaction: ${sceneMemory.interaction || '(unknown)'}
                - props: ${sceneMemory.props?.length ? sceneMemory.props.join(', ') : '(none)'}
                - lighting: ${sceneMemory.lighting || '(unknown)'}
                - mood: ${sceneMemory.mood || '(unknown)'}`
            : 'Current scene memory: (disabled)';

    const promptBuilderRequest = `Select the single most visually representative moment from the CURRENT assistant reply.

        Convert that moment into concise visual tags for image generation.

        Base the tags primarily on the CURRENT assistant reply.
        Use Recent user context and Previous assistant context only to resolve ambiguity or maintain scene continuity.
        Use Current scene memory to preserve stable details unless the CURRENT assistant reply clearly changes them.

        Rules:
        - comma separated
        - 1–4 words per tag
        - 6–12 tags total
        - no sentences
        - no explanations
        - no markup
        - only visible elements
        - do not invent details not clearly visible
        - preserve continuity with scene memory unless explicitly changed

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

        ${memoryBlock}

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

async function handleIncomingMessage() {
    if (isImageAnalysisCall) {
        return;
    }

    if (
        !extension_settings[extensionName] ||
        extension_settings[extensionName].insertType === INSERT_TYPE.DISABLED
    ) {
        return;
    }

    const context = getContext();
    const message = context.chat[context.chat.length - 1];

    if (!message || message.is_user) {
        return;
    }

    if (!extension_settings[extensionName]?.llmAnalysis?.enabled) {
        return;
    }

    let sceneEval = {
        generate: false,
        category: 'dialogue_only',
        weight: 0,
    };

    try {
        isImageAnalysisCall = true;

        if (extension_settings[extensionName]?.sceneMemory?.enabled) {
            const patch = await extractScenePatch(context);
            mergeScenePatch(patch);

            console.log(`[${extensionName}] merged scene memory`, structuredClone(sceneMemory));
        }

        sceneEval = await classifyReplyForImage(context);

        const text = message.mes.toLowerCase();
        const photoRequestRegex =
            /((send|show|lemme\s*see|let\s*me\s*see|i\s*wanna\s*see|i\s*want\s*to\s*see|can\s*i\s*see|got\s*a?|any)\s*(me\s*)?(a\s*)?(pic|photo|picture|selfie|image|shot)s?)|((take|snap|shoot)\s*(me\s*)?(a\s*)?(pic|photo|picture|selfie))/i;

        if (photoRequestRegex.test(userText)) {
            sceneEval.weight = 1.0;
            sceneEval.category = "explicit_request";
        }

        if (sceneEval.category === "nsfw_action") {
            sceneEval.weight = Math.max(sceneEval.weight, 0.9);
        }

        console.log(`[${extensionName}] scene eval`, {
            sceneEval,
            preview: message.mes.slice(0, 200),
        });
    } catch (error) {
        console.error(`[${extensionName}] scene analysis failed`, error);
        return;
    } finally {
        isImageAnalysisCall = false;
    }

    if (!sceneEval.generate) {
        return;
    }

    if (isOnImageCooldown(context)) {
        console.log(`[${extensionName}] skipped due to cooldown`);
        return;
    }

    if (Math.random() > sceneEval.weight) {
        console.log(`[${extensionName}] skipped due to scene weight roll`, sceneEval);
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

    const prompt = sceneTags
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/\n/g, ' ')
        .trim();

    console.log(`[${extensionName}] final SD prompt`, prompt);

    const insertType = extension_settings[extensionName].insertType;

    try {
        toastr.info(`Generating image...`);

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

        markImageGenerated(context);
        toastr.success(`Image generated`);
    } catch (error) {
        toastr.error(`Image generation error: ${error}`);
        console.error(`[${extensionName}] SD generation failed`, error);
    }
}