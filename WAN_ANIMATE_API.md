# Wan Animate API

Generate a video from a character image + reference video.

**Endpoint:** `POST {PARROT_API_URL}/animate`

**Auth:** `X-API-Key: {PARROT_API_KEY}`

**Content-Type:** `multipart/form-data`

## Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | yes | Character image (JPG/PNG/WEBP) |
| `video` | file | yes | Reference video to mimic motion (MP4/WEBM/MOV) |
| `promptText` | string | yes | Motion description + duration, e.g. `dancing gracefully --5sec` |
| `resolution` | string | no | `480p` / `720p` / `1080p` (default `720p`) |
| `seed` | string | no | Integer seed for reproducibility |

Duration in `promptText` should be `--{N}sec` where N ≥ 5.

## Response

```json
{ "video_id": "f7f0eaad-10a0-4f0c-aa70-6a8dc12baec5" }
```

## Polling

`GET {PARROT_API_URL}/videos/{video_id}`

```json
{
  "id": "f7f0eaad-...",
  "status": "queued | started | finished",
  "progress": 85,
  "url": "https://..."
}
```

Poll every ~5s until `status == "finished"`. Typically takes 60–120s.

## Example (curl)

```bash
curl -X POST "https://parrot-test.pika.art/api/v1/generate/v0/animate" \
  -H "X-API-Key: YOUR_KEY" \
  -F "image=@character.jpg" \
  -F "video=@reference.mp4" \
  -F "promptText=dancing gracefully --5sec" \
  -F "resolution=720p"
```
