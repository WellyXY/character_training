---
name: prompt-optimizer
description: Use when converting a user request into an English Seedream prompt with style, clothing, and scene context.
---

# Prompt Optimizer Skill

## Overview
Rewrites user intent into a detailed English prompt optimized for Seedream image generation.

## When to Use
- A user provides a scene request and you need a high quality prompt
- You have style, clothing, or scene parameters to incorporate

## When Not to Use
- You already have a finalized Seedream-ready prompt
- You are generating videos (use video skill plus prompt optimization if needed)

## Inputs
`optimize` action accepts:
- `prompt` (required)
- `style` (optional)
- `cloth` (optional)
- `scene_description` (optional)
- `character_description` (optional)

## Outputs
- `optimized_prompt`: English prompt string
- Echoes `original_prompt`, `style`, and `cloth` on success

## Examples
```text
optimize: {
  "prompt": "在海邊散步的性感氛圍",
  "style": "sexy",
  "cloth": "fashion",
  "scene_description": "sunset beach",
  "character_description": "long black hair, confident gaze"
}
```

## Constraints
- Uses the creative model and may fall back to the original prompt on failure
- Output is English-only and should be used directly by image generation


