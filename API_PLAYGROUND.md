# API Playground

在 AI Studio 旁邊增加 API Playground 入口，點擊後跳轉到新頁面，用於測試以下 API：

| API | Status |
|---|---|
| Streaming Lipsync | Available |
| Image to Video | Coming Soon |
| Image to Video + Audio | Coming Soon |

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
