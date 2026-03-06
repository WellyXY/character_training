# Wan Animate API — Image + Reference Video

使用 Wan2.2 Animate-14B 模型，上传一张人物图片 + 一段参考动作视频，生成角色按参考动作运动的视频。

**Base URL:** `https://parrot-test.pika.art/api/v1/generate/v0`

**Auth:** `X-API-Key: <your_key>`

---

## 1. 创建任务

**`POST /animate`**

`Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | file | yes | 角色图片（JPG / PNG / WebP） |
| `video` | file | yes | 参考动作视频（MP4） |
| `promptText` | string | yes | 动作描述 + 时长，例如 `dancing gracefully --5sec` |
| `resolution` | string | no | `480p` / `720p` / `1080p`，默认 `720p` |
| `seed` | string | no | 随机种子，用于复现结果 |

**`promptText` 时长格式：** `--5sec` / `--10sec` / `--15sec`，建议与参考视频时长保持一致。

**示例（curl）：**
```bash
curl -X POST https://parrot-test.pika.art/api/v1/generate/v0/animate \
  -H "X-API-Key: YOUR_KEY" \
  -F "image=@portrait.jpg" \
  -F "video=@dance.mp4" \
  -F "promptText=dancing gracefully --5sec" \
  -F "resolution=720p"
```

**Response:**
```json
{ "video_id": "f7f0eaad-10a0-4f0c-aa70-6a8dc12baec5" }
```

---

## 2. 轮询状态

**`GET /videos/{video_id}`**

```bash
curl https://parrot-test.pika.art/api/v1/generate/v0/videos/f7f0eaad-10a0-4f0c-aa70-6a8dc12baec5 \
  -H "X-API-Key: YOUR_KEY"
```

**Response（生成中）：**
```json
{ "id": "f7f0eaad...", "status": "started", "progress": 52 }
```

**Response（完成）：**
```json
{
  "id": "f7f0eaad...",
  "status": "finished",
  "progress": 100,
  "url": "https://msaocnoosm1a4.pika.art/user_xxx/f7f0eaad.../f7f0eaad....mp4"
}
```

| status | 说明 |
|---|---|
| `queued` | 排队中 |
| `started` | 生成中，看 `progress` 字段 |
| `finished` | 完成，`url` 字段有视频地址 |

建议每 5 秒 poll 一次，超时设 10 分钟。
