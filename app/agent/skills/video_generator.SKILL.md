---
name: video-generator
description: Use when generating an image-to-video clip for a character via Parrot and storing the result.
---

# Video Generator Skill

## Overview
Creates videos via Parrot (image-to-video). Can use an existing image or generate one first.

## When to Use
- Turning an existing image into a short video clip
- Generating an image first and then converting it to video

## When Not to Use
- Generating still images only (use image generator)
- Prompt refinement (use prompt optimizer)

## Inputs
Actions supported:
- `generate`: `character_id` (required), `source_image_url` (required), `prompt` (optional), `resolution` (optional)
- `generate_with_image`: `character_id` (required), `image_prompt` (required), `video_prompt` (optional), `aspect_ratio` (optional), `style` (optional), `cloth` (optional), `resolution` (optional)

## Outputs
- `video_id`, `video_url`, `thumbnail_url`, `duration`, and a `message` on success
- `success: false` with an `error` string on failure
- When generating an image first, includes `source_image_id` and `source_image_url`

## Examples
```text
generate: { "character_id": "uuid", "source_image_url": "https://...", "prompt": "natural movement" }
generate_with_image: { "character_id": "uuid", "image_prompt": "studio portrait", "video_prompt": "slow head turn" }
```

## Constraints
- `generate_with_image` depends on image generation, which requires approved base images
- Video type is inferred from the prompt (`dance` or `lipsync`/`sing`), otherwise treated as vlog

