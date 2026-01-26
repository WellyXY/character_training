---
name: image-generator
description: Use when generating base or content images for a character via Seedream and storing results.
---

# Image Generator Skill

## Overview
Generates images through Seedream and stores them locally and in the database.

## When to Use
- Creating a base image to establish a character identity
- Creating a content image that references approved base images

## When Not to Use
- Generating videos (use video generator)
- Managing character metadata (use character skill)

## Inputs
Actions supported:
- `generate_base`: `character_id` (required), `prompt` (required), `aspect_ratio` (optional)
- `generate_content`: `character_id` (required), `prompt` (required), `aspect_ratio` (optional), `style` (optional), `cloth` (optional)

Supported aspect ratios:
- `9:16` (default) -> 1024 x 1820
- `1:1` -> 1024 x 1024
- `16:9` -> 1820 x 1024

## Outputs
- `image_id`, `image_url`, and a `message` on success
- `success: false` with an `error` string on failure

## Examples
```text
generate_base: { "character_id": "uuid", "prompt": "portrait, studio lighting", "aspect_ratio": "9:16" }
generate_content: { "character_id": "uuid", "prompt": "sunset beach walk", "style": "sexy", "cloth": "fashion" }
```

## Constraints
- `generate_content` requires approved base images for the character
- Generated images are stored locally and saved as unapproved in the database


