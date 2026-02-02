# 圖片與視頻生成 API

## 圖片生成 (Seedream)

### 1. 基本生成

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations" \
  -H "Authorization: Bearer YOUR_SEEDREAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-4-5-251128",
    "prompt": "a beautiful woman in a coffee shop, warm lighting",
    "size": "1024x1820",
    "n": 1,
    "response_format": "url"
  }'
```

### 2. 使用參考圖片生成（Image Reference）

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations" \
  -H "Authorization: Bearer YOUR_SEEDREAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-4-5-251128",
    "prompt": "the same woman wearing a red dress in a garden",
    "size": "1024x1820",
    "n": 1,
    "response_format": "url",
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  }'
```

**多張參考圖片：**

```bash
curl -X POST "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations" \
  -H "Authorization: Bearer YOUR_SEEDREAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedream-4-5-251128",
    "prompt": "the same woman in a different pose",
    "size": "1024x1820",
    "n": 1,
    "response_format": "url",
    "image": [
      "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
      "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
    ]
  }'
```

**參考圖片格式：**
- 必須是 Base64 Data URL 格式：`data:image/jpeg;base64,{BASE64_DATA}`
- 建議使用 JPEG 格式
- 圖片會自動轉換（PNG/RGBA → RGB JPEG）

### 透過本地後端 API

```bash
curl -X POST "http://localhost:8000/api/v1/generate/direct" \
  -H "Content-Type: application/json" \
  -d '{
    "character_id": "your-character-id",
    "prompt": "a beautiful woman in a coffee shop, warm lighting",
    "aspect_ratio": "9:16"
  }'
```

**長寬比：**
- `9:16` → 1024 x 1820
- `1:1` → 1024 x 1024
- `16:9` → 1820 x 1024

---

## 視頻生成 (Parrot/Pika)

### 1. 提交生成請求

```bash
curl -X POST "https://parrot.pika.art/api/v1/generate/v0/image-to-video-v2" \
  -H "X-API-KEY: YOUR_PARROT_API_KEY" \
  -F "image=@/path/to/image.jpg" \
  -F "promptText=the woman slowly turns her head and smiles"
```

**回應：**
```json
{
  "id": "job-id-12345"
}
```

### 2. 查詢視頻狀態

```bash
curl -X GET "https://parrot.pika.art/api/v1/generate/v0/videos/job-id-12345" \
  -H "X-API-KEY: YOUR_PARROT_API_KEY"
```

**回應（處理中）：**
```json
{
  "id": "job-id-12345",
  "status": "processing"
}
```

**回應（完成）：**
```json
{
  "id": "job-id-12345",
  "status": "finished",
  "video_url": "https://...",
  "thumbnail_url": "https://...",
  "duration": 4.5
}
```

**狀態值：**
- `pending` - 排隊中
- `processing` - 生成中
- `finished` / `completed` / `done` - 完成
- `failed` - 失敗

### 透過本地後端 API（自動輪詢）

```bash
curl -X POST "http://localhost:8000/api/v1/animate/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "image_id": "your-image-id",
    "image_url": "/uploads/abc123",
    "character_id": "your-character-id",
    "prompt": "the woman slowly turns her head and smiles"
  }'
```

---

## 環境變數 (.env)

```bash
# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 圖片生成 (Seedream)
SEEDREAM_API_KEY=72021f63-9cd0-427a-9072-xxxxxxxxxxxx
SEEDREAM_SERVER_URL=https://ark.ap-southeast.bytepluses.com/api/v3
SEEDREAM_GENERATE_PATH=/images/generations
SEEDREAM_MODEL=seedream-4-5-251128

# 視頻生成 (Parrot/Pika)
PARROT_API_KEY=pika_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PARROT_API_URL=https://parrot.pika.art/api/v1/generate/v0

# Twitter (OAuth 1.0a)
TWITTER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_ACCESS_TOKEN=1234567890123456789-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_ACCESS_TOKEN_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 其他
DATABASE_URL=sqlite+aiosqlite:///./data/db/app.db
PUBLIC_BASE_URL=http://localhost:8000
CORS_ORIGINS=*
```
