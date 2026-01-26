---
name: base
description: Use when defining or reviewing the core skill interface and contract for agent skills in this app.
---

# Base Skill

## Overview
The base skill defines the abstract interface that all skills must implement. It is not executable by itself.

## When to Use
- Adding a new skill class
- Reviewing how skills receive inputs and return results
- Ensuring a consistent action dispatch contract

## When Not to Use
- Running any user-facing operation (this is abstract only)
- Looking for business logic or external API calls

## Inputs
- `action`: string name of the operation to perform
- `params`: dict of parameters for the action
- `character_id`: optional character identifier
- `db`: async database session

## Outputs
- A result dict, typically with `success` and either `data` or `error`

## Example
```text
execute(action="create", params={"name": "Luna"}, character_id=None, db=session)
```

## Constraints
- Must be implemented by concrete skills
- Should keep action names stable for agent routing


