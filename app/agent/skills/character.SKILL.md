---
name: character
description: Use when creating, updating, or listing characters, or managing approved base images for a character.
---

# Character Skill

## Overview
Handles character CRUD operations and base image management stored in the database.

## When to Use
- Creating a new character profile
- Updating character metadata (name, description, status)
- Listing characters or approved base images
- Adding or removing approved base images

## When Not to Use
- Generating images or videos (use image or video skills)
- Optimizing prompts (use prompt optimizer)

## Inputs
Actions supported:
- `create`: `name` (required), `description`, `gender`
- `update`: `character_id` (required), `name`, `description`, `status`
- `get`: `character_id` (required)
- `list`: no params
- `list_base_images`: `character_id` (required)
- `add_base_image`: `character_id` (required), `image_url` (required), `metadata` (optional)
- `remove_base_image`: `image_id` (required)

## Outputs
- `success: true` and a message on success
- For list/get actions: structured character or base image data
- `success: false` with an `error` string on failure

## Examples
```text
create: { "name": "Ava", "description": "Cyber idol", "gender": "female" }
list_base_images: { "character_id": "uuid" }
add_base_image: { "character_id": "uuid", "image_url": "https://..." }
```

## Constraints
- Base images are limited to 3 approved images per character
- Only base images can be removed with `remove_base_image`


