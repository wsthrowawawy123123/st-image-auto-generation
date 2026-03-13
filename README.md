# ST Image Auto Generation

A **SillyTavern extension** that automatically generates images during roleplay conversations.

The extension detects when an image should be generated and then calls SillyTavern’s image generation pipeline (e.g. Stable Diffusion) to create and insert the image into chat.

It supports multiple insertion styles, prompt injection, and optional LLM-powered scene analysis.

---

# Core Idea

The extension works by detecting **image prompts embedded in model replies** and converting them into actual generated images.

Typical flow:

1. Inject a prompt telling the model it can emit image tags
2. Model outputs a tag such as:

```text
<pic prompt="girl sitting at a cafe table, sunlight through window">
```

3. The extension detects the tag
4. The prompt is sent to the image generation system
5. The generated image is inserted into the conversation

---

# Image Insertion Modes

The extension supports several ways to insert generated images.

### Inline

The image is inserted directly inside the message where the tag appeared.

### Replace

The `<pic>` tag in the message is replaced with the generated image.

### New Message

The image is generated as a separate chat message.

### Disabled

Image generation is turned off.

---

# Prompt Injection

The extension can automatically inject a hidden instruction into the conversation telling the model how to emit image tags.

Example injected instruction:

```text
When the scene becomes visually interesting, include an image tag in this format:

<pic prompt="visual description here">
```

This allows the model to decide when images should appear.

Injection settings include:

* depth in conversation
* insertion role
* regex for tag detection
* custom prompt template

---

# Regex Tag Detection

The extension uses a configurable regex to detect image prompts inside assistant replies.

Example default format:

```text
<pic prompt="description">
```

The prompt inside the tag is extracted and passed to the image generation system.

---

# Feature Branch: Scene Probability (Experimental)

The `feat/sceneProbability` branch introduces an experimental **LLM-driven scene analysis system**.

Instead of relying solely on the model emitting `<pic>` tags, the extension can analyze each reply and determine whether the scene is visually important enough to generate an image.

This reduces spam images and improves scene continuity.

## Scene Classification

Each assistant reply is analyzed and categorized.

Example output:

```json
{
  "generate": true,
  "category": "pose_change",
  "weight": 0.72
}
```

Possible categories include:

* nsfw_action
* selfie_request
* location_change
* pose_change
* physical_interaction
* food_or_object_focus
* ambient_scene
* dialogue_only

Pure dialogue usually results in:

```text
generate: false
weight: 0
```

---

## Scene Memory

The experimental branch introduces **persistent scene memory** so that images stay visually consistent across messages.

Tracked attributes include:

* location
* environment
* assistant pose
* assistant clothing
* assistant expression
* interaction
* props
* lighting
* mood

Each reply can produce a **scene patch** that updates the current memory.

Location changes automatically reset environment context.

---

## LLM Image Prompt Generation

Instead of requiring the model to output `<pic>` tags, the extension can generate prompts automatically.

The system:

1. Analyzes the assistant reply
2. Reads the current scene memory
3. Selects the most visually representative moment
4. Produces a concise visual prompt

Example generated prompt:

```text
1girl, sitting at cafe table, sunlight through window, coffee mug, relaxed smile
```

---

## Separate Classifier Backend

Scene classification can run on a **separate LLM backend**.

Supported backends include:

* KoboldCPP
* RunPod
* OpenAI-compatible APIs

This allows you to run lightweight classification models separately from your main RP model.

---

# Configuration

The extension exposes settings for:

### Image generation

* insert mode
* prompt injection
* tag regex
* injection depth

### Scene analysis (experimental branch)

* enable scene analysis
* classifier backend
* API endpoint
* model name
* temperature
* token limits

---

# Requirements

* SillyTavern
* An image generation backend (Stable Diffusion or compatible)
* Optional: an LLM endpoint for scene analysis

---

# Status

Core tag-based generation is stable.

The **scene probability system is experimental** and may change as the feature is developed.

---

# License

Same license as the upstream project.
