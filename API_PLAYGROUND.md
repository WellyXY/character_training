# API Playground

在 AI Studio 旁邊增加 API Playground 入口，點擊後跳轉到新頁面，用於測試以下 API：

| API | Status |
|---|---|
| Streaming Lipsync | Available |
| Image to Video | Available |
| Image to Video + Audio | Available |

---

## Streaming Lipsync

**Endpoint:** `POST https://candy-api.pika.art/test/api/v1/realtime/session`

**Auth:** `X-API-Key` header

**Content-Type:** `multipart/form-data`

### Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | yes | Portrait image (JPG/PNG) |
| `voice_id` | string | yes | Voice model ID for TTS. Example: `sample_by_welly` |
| `motion_prompt` | string | yes | Describes motion style while speaking |
| `silent_prompt` | string | yes | Describes resting pose between speech |

### Response

**Success**
```json
{
  "video_url": "https://cdn.pika.art/output/xxxx.mp4",
  "duration": 5.2
}
```

**Error**
```json
{
  "error_code": "INTERNAL_ERROR",
  "message": "Workers failed to connect within 60s (TTS=True, Video=False)",
  "details": {},
  "path": "/api/v1/realtime/session",
  "timestamp": "2026-01-27T00:42:52.394021"
}
```

---

## Image to Video

**Endpoint:** `POST https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2`

**Auth:** `X-API-Key` header

**Content-Type:** `multipart/form-data`

### Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | yes | 角色图片（JPG / PNG / WebP） |
| `promptText` | string | yes | 动作描述，例如 `walking confidently --10sec` |
| `resolution` | string | no | `720x1280`（9:16）/ `1280x720`（16:9）/ `720x720`（1:1） |

### Create Job

```bash
curl -X POST https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2 \
  -H "X-API-Key: YOUR_KEY" \
  -F "image=@portrait.jpg" \
  -F "promptText=walking confidently --10sec" \
  -F "resolution=720x1280"
```

**Response:**
```json
{ "id": "abc123..." }
```

### Poll Status

```bash
curl https://parrot.pika.art/api/v1/generate/v0/videos/abc123... \
  -H "X-API-Key: YOUR_KEY"
```

**Response（完成）：**
```json
{ "id": "abc123...", "status": "finished", "url": "https://..." }
```

---

## Image to Video + Audio

**Endpoint:** `POST https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2-audio`

**Auth:** `X-API-Key` header

**Content-Type:** `multipart/form-data`

### Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | yes | 角色图片（JPG / PNG / WebP） |
| `promptText` | string | yes | 动作描述 |
| `duration` | string | no | 视频时长（秒），默认 `5` |
| `resolution` | string | no | `720p` / `1080p`，默认 `720p` |
| `audio` | file | no | 背景音频（MP3 / WAV / M4A） |

### Create Job

```bash
curl -X POST https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2-audio \
  -H "X-API-Key: YOUR_KEY" \
  -F "image=@portrait.jpg" \
  -F "promptText=dancing energetically" \
  -F "duration=5" \
  -F "resolution=720p" \
  -F "audio=@bgm.mp3"
```

**Response:**
```json
{ "id": "def456..." }
```

### Poll Status

```bash
curl https://parrot.pika.art/api/v1/generate/v0/videos/def456... \
  -H "X-API-Key: YOUR_KEY"
```

**Response（完成）：**
```json
{ "id": "def456...", "status": "finished", "url": "https://..." }
```
